# IonicX AI Assistant

AI-powered chatbot for IonicX — a Singapore-based company that builds AI websites, chatbots, and digital solutions.

## Features

- 🤖 Claude-powered conversational AI
- 📚 Local markdown knowledge base (no external RAG service needed)
- 🌏 Bilingual support (English + Chinese)
- 💰 Answers pricing, services, and FAQ questions
- 🔌 Embeddable widget mode (`build:chat`)
- 🎨 IonicX branded (cyan/green on dark theme)

## Quick Start

```bash
cp .env.local.example .env.local
# Add your Anthropic API key to .env.local

npm install
npm run dev
```

## Build Modes

| Command | Description |
|---------|-------------|
| `npm run dev` | Development (chat only, embeddable) |
| `npm run dev:full` | Development with debug sidebars |
| `npm run build` | Production build (chat only) |
| `npm run build:chat` | Production build (chat only, same as `build`) |
| `npm run build:full` | Production build with debug sidebars |

## Knowledge Base

Edit markdown files in `/knowledge/` to update the chatbot's knowledge:

- `faq.md` — Common questions
- `pricing.md` — Pricing tiers and add-ons
- `services.md` — Service descriptions

The knowledge base is loaded at runtime and injected into the Claude system prompt.

## Embedding

Use `build:chat` mode for a clean chat interface without sidebars — perfect for embedding as a widget on client sites via iframe.

## Tech Stack

- Next.js 14
- Anthropic Claude API
- Tailwind CSS
- TypeScript

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |

## License

Proprietary — IonicX Pte Ltd
