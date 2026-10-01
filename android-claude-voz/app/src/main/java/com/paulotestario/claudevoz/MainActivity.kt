package com.paulotestario.claudevoz

import android.Manifest
import android.animation.ValueAnimator
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Bundle
import android.speech.SpeechRecognizer
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.graphics.Typeface
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity(), VoiceCallController.Listener {

    private lateinit var prefs: Prefs
    private lateinit var controller: VoiceCallController

    private lateinit var orb: View
    private lateinit var status: TextView
    private lateinit var audioRoute: TextView
    private lateinit var live: TextView
    private lateinit var transcript: TextView
    private lateinit var scroll: ScrollView
    private lateinit var callButton: ImageButton
    private lateinit var muteButton: ImageButton
    private lateinit var settingsButton: ImageButton

    private val log = SpannableStringBuilder()
    private var claudeLineOpen = false
    private var pulse: ValueAnimator? = null
    private var rmsScale = 1f

    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCall()
        else Toast.makeText(this, R.string.mic_needed, Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        controller = VoiceCallController(this, prefs, this)

        orb = findViewById<View>(R.id.orb)
        status = findViewById<TextView>(R.id.status)
        audioRoute = findViewById<TextView>(R.id.audioRoute)
        live = findViewById<TextView>(R.id.live)
        transcript = findViewById<TextView>(R.id.transcript)
        scroll = findViewById<ScrollView>(R.id.scroll)
        callButton = findViewById<ImageButton>(R.id.callButton)
        muteButton = findViewById<ImageButton>(R.id.muteButton)
        settingsButton = findViewById<ImageButton>(R.id.settingsButton)

        callButton.setOnClickListener { if (controller.isActive) controller.hangUp() else requestCall() }
        muteButton.setOnClickListener {
            controller.muted = !controller.muted
            renderMute()
        }
        orb.setOnClickListener { if (controller.isActive) controller.interrupt() else requestCall() }
        settingsButton.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }

        onStateChanged(VoiceCallController.State.IDLE)
    }

    override fun onResume() {
        super.onResume()
        if (!controller.isActive) showIdleRoute()
    }

    override fun onDestroy() {
        controller.release()
        pulse?.cancel()
        super.onDestroy()
    }

    private fun requestCall() {
        if (prefs.apiKey.isBlank()) {
            Toast.makeText(this, R.string.need_key, Toast.LENGTH_LONG).show()
            startActivity(Intent(this, SettingsActivity::class.java))
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, R.string.no_recognizer, Toast.LENGTH_LONG).show()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED
        ) startCall() else askMic.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun startCall() {
        log.clear()
        transcript.text = ""
        claudeLineOpen = false
        controller.muted = false
        renderMute()
        controller.start()
    }

    // --- VoiceCallController.Listener ---

    override fun onStateChanged(state: VoiceCallController.State) {
        val active = state != VoiceCallController.State.IDLE
        status.setText(
            when (state) {
                VoiceCallController.State.IDLE -> R.string.state_idle
                VoiceCallController.State.CONNECTING -> R.string.state_connecting
                VoiceCallController.State.LISTENING -> R.string.state_listening
                VoiceCallController.State.THINKING -> R.string.state_thinking
                VoiceCallController.State.SPEAKING -> R.string.state_speaking
                VoiceCallController.State.MUTED -> R.string.state_muted
            }
        )
        callButton.setImageResource(if (active) R.drawable.ic_call_end else R.drawable.ic_call)
        callButton.setBackgroundResource(if (active) R.drawable.bg_round_red else R.drawable.bg_round_green)
        callButton.contentDescription = getString(if (active) R.string.hang_up else R.string.call)
        muteButton.visibility = if (active) View.VISIBLE else View.INVISIBLE
        settingsButton.isEnabled = !active
        settingsButton.alpha = if (active) 0.4f else 1f
        if (state == VoiceCallController.State.IDLE) showIdleRoute()
        if (state != VoiceCallController.State.LISTENING) live.text = ""
        if (active) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        animateOrb(state)
    }

    override fun onPartialSpeech(text: String) {
        live.text = text
    }

    override fun onUserMessage(text: String) {
        claudeLineOpen = false
        appendLine(getString(R.string.you), text, R.color.user_text)
    }

    override fun onClaudeDelta(text: String) {
        if (!claudeLineOpen) {
            claudeLineOpen = true
            appendLine(getString(R.string.claude), "", R.color.claude_accent)
        }
        log.append(text)
        transcript.text = log
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    override fun onClaudeFinished() {
        claudeLineOpen = false
    }

    override fun onError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    override fun onAudioRoute(device: String?, isMetaGlasses: Boolean) {
        audioRoute.visibility = View.VISIBLE
        audioRoute.text = when {
            device == null -> getString(R.string.route_phone)
            isMetaGlasses -> getString(R.string.route_glasses, device)
            else -> getString(R.string.route_bluetooth, device)
        }
    }

    /** Antes da ligação: avisa se o óculos já está conectado ao celular. */
    private fun showIdleRoute() {
        val audio = getSystemService(AUDIO_SERVICE) as AudioManager
        val device = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
        val name = device?.productName?.toString()?.takeIf { it.isNotBlank() }
        if (name != null && prefs.useGlasses) {
            audioRoute.visibility = View.VISIBLE
            audioRoute.text = getString(R.string.route_glasses_ready, name)
        } else {
            audioRoute.visibility = View.GONE
        }
    }

    override fun onVolume(rms: Float) {
        // rms vai de ~-2 a ~10 dB; vira um leve "respirar" do orbe enquanto o usuário fala.
        rmsScale = 1f + ((rms + 2f) / 12f).coerceIn(0f, 1f) * 0.25f
    }

    // --- UI helpers ---

    private fun appendLine(who: String, text: String, colorRes: Int) {
        if (log.isNotEmpty()) log.append("\n\n")
        val start = log.length
        log.append(who).append(": ")
        log.setSpan(StyleSpan(Typeface.BOLD), start, log.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        log.setSpan(
            ForegroundColorSpan(ContextCompat.getColor(this, colorRes)),
            start, log.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        log.append(text)
        transcript.text = log
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun renderMute() {
        muteButton.setImageResource(if (controller.muted) R.drawable.ic_mic_off else R.drawable.ic_mic)
        muteButton.contentDescription = getString(if (controller.muted) R.string.unmute else R.string.mute)
        muteButton.alpha = if (controller.muted) 0.6f else 1f
    }

    private fun animateOrb(state: VoiceCallController.State) {
        pulse?.cancel()
        val (amplitude, duration) = when (state) {
            VoiceCallController.State.IDLE -> 0.03f to 2400L
            VoiceCallController.State.CONNECTING -> 0.08f to 700L
            VoiceCallController.State.LISTENING -> 0.04f to 1400L
            VoiceCallController.State.THINKING -> 0.10f to 600L
            VoiceCallController.State.SPEAKING -> 0.14f to 380L
            VoiceCallController.State.MUTED -> 0f to 2000L
        }
        orb.alpha = if (state == VoiceCallController.State.MUTED) 0.45f else 1f
        rmsScale = 1f
        pulse = ValueAnimator.ofFloat(0f, 1f).apply {
            this.duration = duration
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                val base = 1f + amplitude * (it.animatedValue as Float)
                val listening = state == VoiceCallController.State.LISTENING
                val s = if (listening) base * rmsScale else base
                orb.scaleX = s
                orb.scaleY = s
            }
            start()
        }
    }
}
