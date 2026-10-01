# Claude Voz — ligação de voz com o Claude (Android)

App Android que funciona como o "modo de voz" do ChatGPT, só que conversando com o **Claude**:
você toca em ligar, fala, o Claude responde em voz alta e o app volta a ouvir, sem precisar tocar em nada.

## Como funciona

```
microfone ──► reconhecimento de voz do Android (pt-BR)
          ──► API do Claude (streaming, SDK oficial anthropic-java)
          ──► voz do aparelho (TextToSpeech), frase por frase enquanto a resposta chega
          ──► volta a ouvir
```

- **Toque no círculo** enquanto o Claude fala/pensa para interrompê-lo e falar de novo.
- **Toque no círculo** enquanto você fala para encerrar sua fala na hora.
- Botão de **microfone** silencia/ativa o microfone; botão **vermelho** desliga.
- A conversa tem memória durante a ligação; cada nova ligação começa do zero.
- A tela fica ligada durante a ligação.

## Instalar o APK

1. Abra a release **"Claude Voz (APK mais recente)"** do repositório (tag `claude-voz-latest`)
   ou o artefato `ClaudeVoz-apk` do workflow *APK Android - Claude Voz* no GitHub Actions.
2. Baixe `ClaudeVoz.apk` no celular e instale (permita "instalar apps de fontes desconhecidas").
3. Abra o app → ⚙️ Configurações → cole sua **chave de API da Anthropic**
   (crie em <https://platform.claude.com> → API Keys). A chave fica salva só no aparelho.
4. Toque no botão verde e fale.

Requisitos: Android 8.0+ e um serviço de reconhecimento de voz (o app Google já traz).
Para a voz em português, o "Mecanismo de conversão de texto em voz do Google" com o pacote pt-BR.

## Configurações

| Opção | Padrão |
|---|---|
| Modelo | Claude Opus 5.5 (também: Sonnet 5.5, Haiku 4.5 — mais rápido) |
| Idioma da voz | Português (Brasil) |
| Velocidade da fala | 1.1x |
| Instruções extras | texto livre adicionado ao prompt do sistema |

O app usa esforço `low` (respostas rápidas, ideal para conversa) e, no Opus/Sonnet, ativa o
*fallback* do servidor: se o modelo recusar um pedido, a API tenta automaticamente outro modelo.
O uso é cobrado na sua conta da API da Anthropic.

## Compilar localmente

Abra a pasta `android-claude-voz` no Android Studio, ou:

```bash
cd android-claude-voz
./gradlew assembleRelease   # APK em app/build/outputs/apk/release/
```

O APK é assinado com a chave de debug para facilitar a instalação direta; para publicar
na Play Store, configure uma chave de assinatura própria em `app/build.gradle.kts`.

## Estrutura

- `ClaudeChat.kt` — cliente do Claude (histórico da ligação, streaming, erros).
- `VoiceCallController.kt` — laço ouvir → pensar → falar e interrupções.
- `SentenceSplitter.kt` — quebra a resposta em frases e remove markdown antes de falar.
- `MainActivity.kt` / `SettingsActivity.kt` — telas.
