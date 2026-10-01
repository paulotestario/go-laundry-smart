package com.paulotestario.claudevoz

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.core.http.StreamResponse
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.InternalServerException
import com.anthropic.errors.NotFoundException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.helpers.BetaMessageAccumulator
import com.anthropic.models.beta.messages.BetaMessageParam
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaRawMessageStreamEvent
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.MessageCreateParams

/**
 * Conversa com o Claude mantendo o histórico da ligação.
 *
 * O histórico é só acrescentado (nunca editado), e a resposta completa do
 * modelo (incluindo blocos de raciocínio) é devolvida no turno seguinte.
 */
class ClaudeChat(
    apiKey: String,
    private val model: String,
    private val systemPrompt: String,
) : AutoCloseable {

    data class Reply(val text: String, val interrupted: Boolean, val refused: Boolean)

    private val client: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(apiKey)
        .build()

    private val history = mutableListOf<BetaMessageParam>()

    @Volatile private var cancelled = false
    @Volatile private var currentStream: StreamResponse<BetaRawMessageStreamEvent>? = null

    /** Interrompe a resposta em andamento (o usuário tocou para falar). */
    fun cancel() {
        cancelled = true
        runCatching { currentStream?.close() }
    }

    /**
     * Envia a fala do usuário e transmite a resposta em pedaços via [onText].
     * Bloqueante: chame fora da thread principal.
     */
    fun reply(userText: String, onText: (String) -> Unit): Reply {
        cancelled = false
        history.add(
            BetaMessageParam.builder()
                .role(BetaMessageParam.Role.USER)
                .content(userText)
                .build()
        )

        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(16000L)
            .system(systemPrompt)
            .messages(history.toList())
        if (supportsEffort(model)) {
            // Conversa por voz: respostas rápidas valem mais que raciocínio longo.
            params.outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
        }
        if (supportsFallback(model)) {
            // Se o modelo recusar, a API refaz o pedido num modelo alternativo.
            params.addBeta("server-side-fallback-2026-07-01")
            params.putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
        }

        val accumulator = BetaMessageAccumulator.create()
        val spoken = StringBuilder()
        try {
            client.beta().messages().createStreaming(params.build()).use { stream ->
                currentStream = stream
                val events = stream.stream().iterator()
                while (!cancelled && events.hasNext()) {
                    val event = accumulator.accumulate(events.next())
                    event.contentBlockDelta()
                        .flatMap { it.delta().text() }
                        .ifPresent { delta ->
                            spoken.append(delta.text())
                            onText(delta.text())
                        }
                }
            }
        } catch (e: Exception) {
            if (!cancelled) throw e
        } finally {
            currentStream = null
        }

        if (cancelled) {
            // Guarda só o que chegou a ser dito antes da interrupção.
            if (spoken.isNotBlank()) {
                history.add(
                    BetaMessageParam.builder()
                        .role(BetaMessageParam.Role.ASSISTANT)
                        .content(spoken.toString())
                        .build()
                )
            }
            return Reply(spoken.toString(), interrupted = true, refused = false)
        }

        val message = accumulator.message()
        history.add(message.toParam())
        val refused = message.stopReason().orElse(null) == BetaStopReason.REFUSAL
        return Reply(spoken.toString(), interrupted = false, refused = refused)
    }

    override fun close() {
        cancel()
        client.close()
    }

    companion object {
        const val DEFAULT_MODEL = "claude-opus-5-5"

        val MODELS = listOf(
            "claude-opus-5-5" to "Claude Opus 5.5 (mais inteligente)",
            "claude-sonnet-5-5" to "Claude Sonnet 5.5 (equilibrado)",
            "claude-haiku-4-5" to "Claude Haiku 4.5 (mais rápido)",
        )

        /** Mensagem curta, em português, para falar ao usuário quando algo dá errado. */
        fun describeError(e: Throwable): String = when (e) {
            is UnauthorizedException -> "Sua chave de API é inválida. Confira nas configurações."
            is PermissionDeniedException -> "Sua chave de API não tem permissão para usar este modelo."
            is NotFoundException -> "Modelo não encontrado. Escolha outro nas configurações."
            is RateLimitException -> "Muitas requisições agora. Espere um pouco e tente de novo."
            is BadRequestException -> "O pedido foi recusado pela API: ${e.message}"
            is InternalServerException -> "Os servidores do Claude estão com problema. Tente de novo."
            is AnthropicServiceException -> "Erro da API (${e.statusCode()}). Tente de novo."
            is AnthropicIoException -> "Sem conexão com a internet."
            else -> "Ocorreu um erro: ${e.message ?: e.javaClass.simpleName}"
        }

        private fun supportsEffort(model: String) = !model.startsWith("claude-haiku")

        private fun supportsFallback(model: String) =
            model == "claude-opus-5-5" || model == "claude-sonnet-5-5"
    }
}
