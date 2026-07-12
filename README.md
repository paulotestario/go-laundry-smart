# Go Laundry Smart

Sistema de lavanderia self-service inteligente: o cliente escaneia um QR code na máquina, acompanha o tempo restante do ciclo (lavagem/secagem) pelo celular como um PWA instalável, e recebe uma notificação quando o ciclo termina.

## Como funciona

1. Cliente paga no dispositivo instalado na própria máquina — o pulso de pagamento já chega identificado (`{maquina, timestamp, valor}`).
2. O backend grava a sessão no acionamento: `{maquina, inicio, duracao_min, pagamento_id, status}`.
3. O QR code fixo colado na máquina abre a página do cronômetro, que consulta a sessão ativa mais recente daquela máquina — sem ambiguidade entre pagamentos concorrentes.

Detalhes e histórico das decisões de arquitetura em [CONTEXTO.md](CONTEXTO.md).

## Estrutura

```
├── index.html            # Página do cronômetro (PWA): anel de progresso, estado concluído, card de instalação
├── manifest.json         # Manifesto do PWA
├── service-worker.js     # Service worker mínimo (instalabilidade; push ainda não implementado)
├── icon-192.png          # Ícone do PWA
├── icon-512.png          # Ícone do PWA
├── docs/
│   ├── CONTEXTO-CONVERSA.md      # Transcrição da conversa original de concepção
│   ├── fluxo-lavanderia.mermaid  # Diagrama v1 (casamento por valor/horário — descartado)
│   └── fluxo-lavanderia-v2.mermaid  # Diagrama v2 (device por máquina — decisão final)
└── demo/
    ├── qrcode-fluxo-completo.mp4 # Vídeo demo: escanear → instalar → notificação (16s)
    └── video-scene*.html         # Fontes das animações do vídeo (material de apresentação)
```

## Rodando localmente

A página do cronômetro recebe os dados por parâmetros de URL:

```
index.html?maquina=1&tipo=lavagem&inicio=2026-07-07T10:10:00&duracao=50
```

Para testar a instalação do PWA é necessário servir por HTTPS (ou `localhost`), com `manifest.json` e `service-worker.js` no mesmo diretório.

## Próximos passos

1. Listener de `push` no service worker + backend de envio (Firebase Cloud Messaging).
2. Backend real para resolver os parâmetros do QR code a partir da tabela `sessoes`.
3. Definir a stack do backend.
4. Testar o fluxo de instalação PWA em Android real.

## Equipe

Paulo Testa e Alisson Muriqui.
