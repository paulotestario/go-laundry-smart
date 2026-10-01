package com.paulotestario.claudevoz

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Usa o óculos Ray-Ban Meta (ou qualquer fone Bluetooth) como microfone e
 * alto-falante da ligação, pelo perfil de chamada (SCO), igual a uma ligação
 * telefônica: o reconhecimento de voz ouve o microfone do óculos e a voz do
 * Claude sai nos alto-falantes dele.
 */
class GlassesAudio(context: Context, private val listener: Listener) {

    interface Listener {
        /** [name] é o nome do aparelho em uso, ou null se voltou para o celular. */
        fun onRouteChanged(name: String?, isMetaGlasses: Boolean)
    }

    private val appContext = context.applicationContext
    private val audio = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val main = Handler(Looper.getMainLooper())

    private var active = false
    private var previousMode = AudioManager.MODE_NORMAL
    private var legacyReceiverRegistered = false

    /** Nome do aparelho Bluetooth em uso, ou null. */
    var routedDevice: String? = null
        private set

    /** Há um óculos/fone Bluetooth de chamada conectado agora? */
    fun findBluetoothDevice(): AudioDeviceInfo? =
        audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
        }

    /** Passa a ligação para o Bluetooth, se houver. Retorna true se conseguiu. */
    fun start(): Boolean {
        if (active) return routedDevice != null
        active = true
        audio.registerAudioDeviceCallback(deviceCallback, main)
        return route()
    }

    fun stop() {
        if (!active) return
        active = false
        audio.unregisterAudioDeviceCallback(deviceCallback)
        unroute()
    }

    private fun route(): Boolean {
        val device = findBluetoothDevice() ?: return false
        previousMode = audio.mode
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val target = audio.availableCommunicationDevices.firstOrNull {
                it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
            }
            target != null && audio.setCommunicationDevice(target)
        } else {
            startLegacySco()
            true
        }
        if (!ok) {
            audio.mode = previousMode
            return false
        }
        val name = device.productName?.toString()?.takeIf { it.isNotBlank() } ?: "Bluetooth"
        routedDevice = name
        listener.onRouteChanged(name, isMetaGlasses(name))
        return true
    }

    private fun unroute() {
        if (routedDevice == null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audio.clearCommunicationDevice()
        } else {
            stopLegacySco()
        }
        audio.mode = previousMode
        routedDevice = null
        listener.onRouteChanged(null, false)
    }

    @Suppress("DEPRECATION")
    private fun startLegacySco() {
        if (!legacyReceiverRegistered) {
            appContext.registerReceiver(
                scoReceiver, IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
            )
            legacyReceiverRegistered = true
        }
        audio.startBluetoothSco()
        audio.isBluetoothScoOn = true
    }

    @Suppress("DEPRECATION")
    private fun stopLegacySco() {
        audio.isBluetoothScoOn = false
        audio.stopBluetoothSco()
        if (legacyReceiverRegistered) {
            runCatching { appContext.unregisterReceiver(scoReceiver) }
            legacyReceiverRegistered = false
        }
    }

    private val scoReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
            if (state == AudioManager.SCO_AUDIO_STATE_DISCONNECTED && active && routedDevice != null) {
                // O óculos desconectou no meio da ligação: volta para o celular.
                main.post { unroute() }
            }
        }
    }

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            if (active && routedDevice == null &&
                addedDevices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
            ) route()
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            if (active && routedDevice != null && findBluetoothDevice() == null) unroute()
        }
    }

    companion object {
        fun isMetaGlasses(name: String): Boolean {
            val n = name.lowercase()
            return "ray-ban" in n || "rayban" in n || "meta" in n || "oakley" in n
        }
    }
}
