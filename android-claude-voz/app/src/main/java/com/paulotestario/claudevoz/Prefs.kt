package com.paulotestario.claudevoz

import android.content.Context

/** Configurações salvas no aparelho. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("claude_voz", Context.MODE_PRIVATE)

    var apiKey: String
        get() = sp.getString("api_key", "") ?: ""
        set(v) = sp.edit().putString("api_key", v.trim()).apply()

    var model: String
        get() = sp.getString("model", ClaudeChat.DEFAULT_MODEL) ?: ClaudeChat.DEFAULT_MODEL
        set(v) = sp.edit().putString("model", v).apply()

    /** Velocidade da fala do TTS (1.0 = normal). */
    var speechRate: Float
        get() = sp.getFloat("speech_rate", 1.1f)
        set(v) = sp.edit().putFloat("speech_rate", v).apply()

    var language: String
        get() = sp.getString("language", "pt-BR") ?: "pt-BR"
        set(v) = sp.edit().putString("language", v).apply()

    var personality: String
        get() = sp.getString("personality", "") ?: ""
        set(v) = sp.edit().putString("personality", v.trim()).apply()

    fun systemPrompt(): String = buildString {
        append(
            """
            Você é o Claude, conversando com o usuário por uma ligação de voz no celular.
            Tudo o que você escrever será lido em voz alta por um sintetizador de voz, então:
            - Responda de forma natural e conversacional, como numa ligação telefônica.
            - Seja breve: em geral de uma a três frases, a menos que o usuário peça detalhes.
            - Não use markdown, listas, tabelas, emojis, links ou blocos de código.
            - Escreva números, siglas e símbolos do jeito que devem ser falados.
            - O texto do usuário vem de reconhecimento de voz e pode ter erros; interprete com bom senso e,
              se não entender, peça para repetir.
            Responda no idioma em que o usuário falar (padrão: $language).
            """.trimIndent()
        )
        if (personality.isNotBlank()) {
            append("\n\nInstruções adicionais do usuário: ")
            append(personality)
        }
    }
}
