package com.paulotestario.claudevoz

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Laço da ligação: ouvir (SpeechRecognizer) → perguntar ao Claude (streaming)
 * → falar a resposta (TextToSpeech) → ouvir de novo.
 *
 * Todos os métodos públicos devem ser chamados na thread principal.
 */
class VoiceCallController(
    private val context: Context,
    private val prefs: Prefs,
    private val listener: Listener,
) {
    enum class State { IDLE, CONNECTING, LISTENING, THINKING, SPEAKING, MUTED }

    interface Listener {
        fun onStateChanged(state: State)
        fun onPartialSpeech(text: String)
        fun onUserMessage(text: String)
        fun onClaudeDelta(text: String)
        fun onClaudeFinished()
        fun onError(message: String)
        fun onVolume(rms: Float)
    }

    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()

    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var chat: ClaudeChat? = null
    private val splitter = SentenceSplitter()

    var state = State.IDLE
        private set

    /** Incrementa a cada turno; callbacks de turnos antigos são ignorados. */
    private var turn = 0
    private var pendingUtterances = 0
    private var streamFinished = true
    private var utteranceSeq = 0

    val isActive get() = state != State.IDLE

    fun start() {
        if (isActive) return
        setState(State.CONNECTING)
        chat = ClaudeChat(prefs.apiKey, prefs.model, prefs.systemPrompt())
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(recognitionListener)
        }
        tts = TextToSpeech(context) { status ->
            main.post {
                if (state != State.CONNECTING) return@post
                if (status != TextToSpeech.SUCCESS) {
                    listener.onError("Não foi possível iniciar a voz do aparelho (TTS).")
                    hangUp()
                    return@post
                }
                configureTts()
                listen()
            }
        }
    }

    fun hangUp() {
        turn++
        chat?.let { c -> worker.execute { runCatching { c.close() } } }
        chat = null
        recognizer?.run { cancel(); destroy() }
        recognizer = null
        tts?.run { stop(); shutdown() }
        tts = null
        splitter.reset()
        setState(State.IDLE)
    }

    /** Toque no círculo: interrompe o Claude e volta a ouvir. */
    fun interrupt() {
        when (state) {
            State.THINKING, State.SPEAKING -> {
                turn++
                chat?.cancel()
                tts?.stop()
                splitter.reset()
                listen()
            }
            State.LISTENING -> {
                // Força o fim da fala do usuário agora.
                recognizer?.stopListening()
            }
            else -> Unit
        }
    }

    private fun applyMute(muted: Boolean) {
        if (!isActive || state == State.CONNECTING) return
        if (muted) {
            recognizer?.cancel()
            if (state == State.LISTENING) setState(State.MUTED)
        } else if (state == State.MUTED) {
            listen()
        }
    }

    var muted = false
        set(value) {
            field = value
            applyMute(value)
        }

    fun release() {
        hangUp()
        worker.shutdownNow()
    }

    private fun configureTts() {
        val engine = tts ?: return
        val locale = Locale.forLanguageTag(prefs.language)
        val result = engine.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            listener.onError("A voz em ${locale.displayName} não está instalada. Usando a voz padrão.")
        }
        engine.setSpeechRate(prefs.speechRate)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) {
                main.post { if (ownedByCurrentTurn(utteranceId)) setState(State.SPEAKING) }
            }

            override fun onDone(utteranceId: String) {
                main.post { utteranceFinished(utteranceId) }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) {
                main.post { utteranceFinished(utteranceId) }
            }

            override fun onStop(utteranceId: String, interrupted: Boolean) {
                // Interrupções já trocam de turno; nada a fazer.
            }
        })
    }

    private fun listen() {
        if (muted) {
            setState(State.MUTED)
            return
        }
        val rec = recognizer ?: return
        setState(State.LISTENING)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, prefs.language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        rec.cancel()
        rec.startListening(intent)
    }

    private fun ask(text: String) {
        val c = chat ?: return
        val myTurn = ++turn
        pendingUtterances = 0
        streamFinished = false
        splitter.reset()
        setState(State.THINKING)
        listener.onUserMessage(text)

        worker.execute {
            try {
                val reply = c.reply(text) { delta ->
                    main.post {
                        if (myTurn != turn) return@post
                        listener.onClaudeDelta(delta)
                        splitter.add(delta).forEach { speak(it, myTurn) }
                    }
                }
                main.post {
                    if (myTurn != turn) return@post
                    if (reply.refused && reply.text.isBlank()) {
                        val msg = "Desculpe, não posso ajudar com isso."
                        listener.onClaudeDelta(msg)
                        speak(msg, myTurn)
                    }
                    splitter.flush().takeIf { it.isNotBlank() }?.let { speak(it, myTurn) }
                    streamFinished = true
                    listener.onClaudeFinished()
                    if (pendingUtterances == 0) listen()
                }
            } catch (e: Throwable) {
                main.post {
                    if (myTurn != turn) return@post
                    val msg = ClaudeChat.describeError(e)
                    listener.onError(msg)
                    streamFinished = true
                    speak(msg, myTurn)
                }
            }
        }
    }

    private fun speak(text: String, forTurn: Int) {
        val engine = tts ?: return
        pendingUtterances++
        val id = "t$forTurn-${utteranceSeq++}"
        engine.speak(text, TextToSpeech.QUEUE_ADD, null, id)
    }

    private fun ownedByCurrentTurn(utteranceId: String) = utteranceId.startsWith("t$turn-")

    private fun utteranceFinished(utteranceId: String) {
        if (!ownedByCurrentTurn(utteranceId)) return
        pendingUtterances = (pendingUtterances - 1).coerceAtLeast(0)
        if (pendingUtterances == 0 && streamFinished && isActive) listen()
        else if (pendingUtterances == 0 && !streamFinished) setState(State.THINKING)
    }

    private fun setState(s: State) {
        if (state == s) return
        state = s
        listener.onStateChanged(s)
    }

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = Unit
        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = listener.onVolume(rmsdB)
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty()
            if (text.isNotBlank()) listener.onPartialSpeech(text)
        }

        override fun onResults(results: Bundle?) {
            if (state != State.LISTENING) return
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty().trim()
            if (text.isBlank()) listen() else ask(text)
        }

        override fun onError(error: Int) {
            if (state != State.LISTENING) return
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> listen()
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    listener.onError("Permissão de microfone negada.")
                    hangUp()
                }
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> {
                    listener.onError("Reconhecimento de voz sem internet. Tentando de novo…")
                    main.postDelayed({ if (state == State.LISTENING) listen() }, 1500)
                }
                else -> {
                    // ERROR_CLIENT / ERROR_RECOGNIZER_BUSY etc.: espera um pouco e tenta de novo.
                    val t = turn
                    main.postDelayed({ if (state == State.LISTENING && t == turn) listen() }, 400)
                }
            }
        }
    }
}
