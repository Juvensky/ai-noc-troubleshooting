# AI NOC Troubleshooting Assistant

An AI chat assistant for network operations (NOC) troubleshooting. Describe a network or infrastructure problem and it gives step-by-step help and asks for missing details like device model, logs, or topology. Built on Cloudflare Workers, Workers AI (Llama 3.3), and Durable Objects.

**[Try the live demo](https://ai-noc-troubleshooting.berlusjuven.workers.dev)**

## Try these prompts

- `BGP session keeps flapping on my edge router`
- `A new Linux server in Rack 12 (10.12.1.50/24, gw 10.12.1.1) can ping its rack but not Rack 14, and the first traceroute hop times out. What should I check on the server first?`

## Architecture

| Component | Technology |
|---|---|
| LLM | Llama 3.3 70B on Cloudflare Workers AI |
| Coordination | A Worker routes each chat to a per-session Durable Object |
| User input | Streaming chat page served by the Worker (static assets) |
| Memory | Durable Object storage keeps each conversation server-side |

## Features

- Streaming responses over Server-Sent Events (SSE)
- NOC engineer system prompt for network troubleshooting
- Per-visitor conversation memory stored in a Durable Object
- Saved history viewable at `/api/history`
- Responsive chat UI for mobile and desktop
- Built-in Workers Observability logging

## How it works

1. The browser sends a message to `/api/chat`.
2. The Worker identifies the visitor by cookie and forwards the request to that visitor's Durable Object.
3. The Durable Object saves the message, sends the last 20 messages to the model, and streams the reply back.
4. The reply is saved too, so the conversation is stored server-side and can be read from `/api/history`.

## Project structure

```
/
├── public/             # Static assets
│   ├── index.html      # Chat UI HTML
│   └── chat.js         # Chat UI frontend script
├── src/
│   ├── index.ts        # Worker entry point and ChatSession Durable Object
│   └── types.ts        # TypeScript type definitions
├── test/               # Test files
├── wrangler.jsonc      # Worker, AI, and Durable Object configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This documentation
```

## Run it yourself

Prerequisites: [Node.js](https://nodejs.org/) v18 or newer and a Cloudflare account with Workers AI access.

```
git clone https://github.com/Juvensky/ai-noc-troubleshooting.git
cd ai-noc-troubleshooting
npm install
npm run cf-typegen
npm run dev
```

The dev server runs at http://localhost:8787. Workers AI runs on Cloudflare's network, so local development uses your account and can incur usage charges.

Deploy with `npm run deploy`. View live logs with `npx wrangler tail`.

## Customization

- **Model:** change `MODEL_ID` in `src/index.ts`. Browse options in the [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/).
- **Behavior:** edit `SYSTEM_PROMPT` in `src/index.ts`.
- **Styling:** edit the CSS variables at the top of `public/index.html`.
- **AI Gateway:** for logging, caching, and rate limits, see the [AI Gateway docs](https://developers.cloudflare.com/ai-gateway/).

## Resources

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
