# Go Laundry Smart — Contexto do Projeto

> Este arquivo resume as decisões de arquitetura tomadas até aqui, para que qualquer pessoa (ou o Claude Code) entenda o "porquê" por trás do código, não só o "o quê".

## Visão geral

Sistema de gestão de lavanderia inteligente. Cliente escaneia um QR code na máquina,
acompanha o tempo restante do ciclo (lavagem/secagem) pelo celular, pode instalar um
atalho na tela inicial (PWA), e recebe uma notificação push quando o ciclo termina.

Equipe: Paulo Testa e Alisson Muriqui.

---

## Decisões de arquitetura (histórico do raciocínio)

### 1. Como vincular pagamento → máquina

**Problema inicial:** vários clientes pagando o mesmo valor em minutos próximos —
como saber qual pagamento corresponde a qual máquina, se a API de pagamento só
retorna valor + horário?

**Ideias descartadas:**
- Casar pagamento por valor + timestamp aproximado → frágil com concorrência
  (3 clientes pagando R$80 em minutos próximos geram ambiguidade).
- Arduino avisando "máquina X foi acionada" para casar depois com a lista de
  pagamentos → só move o problema de lugar, ainda depende de sincronismo de relógio.

**Decisão final:** cada máquina tem seu próprio dispositivo de pagamento físico
instalado nela. O pulso de pagamento já chega identificado
(`{maquina: "MAQ-01", timestamp, valor}`) — não há necessidade de casar nada.
**A identificação nasce no momento do pagamento, não é reconstruída depois.**

O vínculo é gravado uma única vez, no acionamento:
```
sessoes: { maquina, inicio, duracao_min, pagamento_id, status }
```
Consultas subsequentes (via QR code) apenas buscam a sessão mais recente daquela
máquina — sem ambiguidade.

### 2. Nomenclatura lava-e-seca (conjunto)

Pares lavadora/secadora são modelados com um campo `conjunto` compartilhado, além de
`tipo` (lavadora/secadora) explícito — em vez de codificar o tipo apenas no nome de
exibição (ex: "Máquina 1.1").

```
MAQ-01    | Máquina 1   | lavadora | conjunto: 1
MAQ-01-S  | Máquina 1.1 | secadora | conjunto: 1
```

Por quê: permite relacionar lavadora↔secadora do mesmo conjunto (ex: sugerir
liberar a secadora quando a lavagem termina) sem depender de parsing de string.
O `id_interno` (chave técnica) é estável mesmo que o nome de exibição mude.

### 3. QR code fixo + resolução dinâmica no backend

QR codes são fixos por máquina (colados fisicamente). O backend resolve os
parâmetros dinamicamente a cada escaneamento, evitando reimpressão de QR codes.

URL de exemplo: `?maquina=1&tipo=lavagem&inicio=ISO&duracao=50`

### 4. PWA (Progressive Web App) em vez de app nativo

Cliente instala um "atalho" (PWA) na tela inicial via `manifest.json` +
`service-worker.js`. Funciona em Android (Chrome) e iOS (Safari, com limitações —
push real no iOS só funciona se o PWA já estiver instalado na tela de início).

### 5. Notificação push — status atual

O protótipo em vídeo simula a notificação, mas **push real com app fechado exige
mais do que o service worker atual tem**:
- Web Push API (protocolo padrão)
- Um serviço de envio no backend — Firebase Cloud Messaging (mais fácil) ou
  implementação própria com a lib `web-push` (Node.js)
- Um listener de evento `push` no `service-worker.js` (ainda não implementado —
  próximo passo técnico)

---

## Próximos passos (em aberto)

1. Implementar o listener de `push` no service worker + backend de envio
   (Firebase Cloud Messaging é a opção mais simples para começar).
2. Backend real para resolver os parâmetros do QR code a partir da tabela `sessoes`.
3. Definir se o backend roda em quê stack (não decidido ainda nas conversas).
4. Testar o fluxo de instalação PWA em Android real (só foi simulado em vídeo).

---

## Arquivos incluídos neste pacote

- `index.html` — página do cronômetro (PWA), com anel de progresso, estado
  "concluído", e card de instalação (detecta iOS vs Android).
- `manifest.json` + `icon-192.png` + `icon-512.png` — ativos do PWA.
- `service-worker.js` — service worker mínimo (cache para instalabilidade;
  **ainda sem listener de push**).
- `fluxo-lavanderia.mermaid` / `fluxo-lavanderia-v2.mermaid` — diagramas de
  sequência do fluxo pagamento → acionamento → QR code.
- `video-scene.html`, `video-scene-step2.html`, `video-scene-step3.html` —
  fontes das animações usadas nos vídeos de demonstração (não fazem parte do
  produto, são só material de apresentação).
- Vídeos de demonstração (escanear → instalar → notificação).

---

## Como continuar com o Claude Code

Abra esta pasta com o Claude Code (`cd pasta && claude`) e peça, por exemplo:
"Leia o CONTEXTO.md e me ajude a implementar o listener de push no service worker."
