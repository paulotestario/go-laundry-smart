package com.paulotestario.claudevoz

/**
 * Junta os pedaços de texto que chegam por streaming e libera frases completas,
 * para o TTS começar a falar antes de a resposta inteira chegar.
 */
class SentenceSplitter(private val minLength: Int = 24) {
    private val buffer = StringBuilder()

    /** Adiciona texto e devolve as frases que já podem ser faladas. */
    fun add(text: String): List<String> {
        buffer.append(text)
        val out = mutableListOf<String>()
        var start = 0
        var i = 0
        while (i < buffer.length) {
            val c = buffer[i]
            val atBoundary = c == '\n' ||
                (c in ".!?;:" && (i + 1 < buffer.length && buffer[i + 1].isWhitespace()))
            if (atBoundary && i + 1 - start >= minLength || c == '\n' && i > start) {
                out += buffer.substring(start, i + 1)
                start = i + 1
            }
            i++
        }
        buffer.delete(0, start)
        return out.map(::clean).filter { it.isNotBlank() }
    }

    /** Devolve o que sobrou no buffer ao fim da resposta. */
    fun flush(): String {
        val rest = clean(buffer.toString())
        buffer.clear()
        return rest
    }

    fun reset() = buffer.clear()

    companion object {
        private val markdown = Regex("""[*_`#>|~]+""")
        private val bullet = Regex("""(?m)^\s*([-•]|\d+\.)\s+""")
        private val link = Regex("""\[([^\]]+)]\([^)]+\)""")

        /** Remove marcações que soariam estranhas em voz alta. */
        fun clean(text: String): String = text
            .replace(link, "$1")
            .replace(bullet, "")
            .replace(markdown, "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
