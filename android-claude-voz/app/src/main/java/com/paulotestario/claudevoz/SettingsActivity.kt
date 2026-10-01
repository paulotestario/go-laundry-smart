package com.paulotestario.claudevoz

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {

    private val languages = listOf(
        "pt-BR" to "Português (Brasil)",
        "pt-PT" to "Português (Portugal)",
        "en-US" to "English (US)",
        "es-ES" to "Español",
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = getString(R.string.settings)

        val prefs = Prefs(this)
        val apiKey = findViewById<EditText>(R.id.apiKey)
        val model = findViewById<Spinner>(R.id.model)
        val language = findViewById<Spinner>(R.id.language)
        val rate = findViewById<SeekBar>(R.id.rate)
        val rateLabel = findViewById<TextView>(R.id.rateLabel)
        val personality = findViewById<EditText>(R.id.personality)
        val useGlasses = findViewById<CheckBox>(R.id.useGlasses)
        useGlasses.isChecked = prefs.useGlasses

        apiKey.setText(prefs.apiKey)
        personality.setText(prefs.personality)

        model.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, ClaudeChat.MODELS.map { it.second }
        )
        model.setSelection(ClaudeChat.MODELS.indexOfFirst { it.first == prefs.model }.coerceAtLeast(0))

        language.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, languages.map { it.second }
        )
        language.setSelection(languages.indexOfFirst { it.first == prefs.language }.coerceAtLeast(0))

        // SeekBar 0..15 → velocidade 0.5x..2.0x
        fun rateOf(progress: Int) = 0.5f + progress / 10f
        fun showRate(progress: Int) {
            rateLabel.text = getString(R.string.speech_rate_value, rateOf(progress))
        }
        rate.max = 15
        rate.progress = ((prefs.speechRate - 0.5f) * 10).toInt().coerceIn(0, 15)
        showRate(rate.progress)
        rate.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) = showRate(progress)
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })

        findViewById<Button>(R.id.save).setOnClickListener {
            prefs.apiKey = apiKey.text.toString()
            prefs.model = ClaudeChat.MODELS[model.selectedItemPosition].first
            prefs.language = languages[language.selectedItemPosition].first
            prefs.speechRate = rateOf(rate.progress)
            prefs.personality = personality.text.toString()
            prefs.useGlasses = useGlasses.isChecked
            Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
