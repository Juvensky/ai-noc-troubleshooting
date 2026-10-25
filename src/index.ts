/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { DurableObject } from "cloudflare:workers";
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
	"You are a senior NOC engineer. Give clear, step-by-step network troubleshooting help. Ask for missing details like device model, logs, or topology when needed.";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (!url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/chat" || url.pathname === "/api/history") {
			// One conversation per browser, tracked with a cookie
			const cookie = request.headers.get("cookie") ?? "";
			const existing = cookie.match(/(?:^|;\s*)sid=([\w-]+)/)?.[1];
			const sid = existing ?? crypto.randomUUID();

			const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(sid));
			const res = await stub.fetch(request);

			const out = new Response(res.body, res);
			if (!existing) {
				out.headers.append(
					"set-cookie",
					`sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
				);
			}
			return out;
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export class ChatSession extends DurableObject<Env> {
	private async load(): Promise<ChatMessage[]> {
		return (await this.ctx.storage.get<ChatMessage[]>("messages")) ?? [];
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// View or clear saved history
		if (url.pathname === "/api/history") {
			if (request.method === "DELETE") {
				await this.ctx.storage.delete("messages");
				return Response.json({ ok: true });
			}
			return Response.json({ messages: await this.load() });
		}

		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			// The page sends its whole history; we only need the newest user message
			const { messages = [] } = (await request.json()) as {
				messages: ChatMessage[];
			};
			const last = [...messages].reverse().find((m) => m.role === "user");
			if (!last) {
				return Response.json({ error: "No user message" }, { status: 400 });
			}

			const history = await this.load();
			history.push({ role: "user", content: last.content });
			await this.ctx.storage.put("messages", history);

			const stream = (await this.env.AI.run(MODEL_ID as any, {
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					...history.slice(-20), // keep the last 20 messages as context
				],
				max_tokens: 1024,
				stream: true,
			} as any)) as unknown as ReadableStream<Uint8Array>;

			const [toClient, toSave] = stream.tee();
			this.ctx.waitUntil(this.saveReply(history, toSave));

			return new Response(toClient, {
				headers: {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache",
				},
			});
		} catch (error) {
			console.error("Chat error:", error);
			return Response.json({ error: "Failed to process request" }, { status: 500 });
		}
	}

	// Read the streamed reply and append it to stored history
	private async saveReply(history: ChatMessage[], stream: ReadableStream<Uint8Array>) {
		const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
		let buf = "";
		let reply = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += value;
			const lines = buf.split("\n");
			buf = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.startsWith("data:")) continue;
				const data = line.slice(5).trim();
				if (!data || data === "[DONE]") continue;
				try {
					const j = JSON.parse(data);
					reply += j.response ?? j.choices?.[0]?.delta?.content ?? "";
				} catch {}
			}
		}
		if (reply) {
			history.push({ role: "assistant", content: reply });
			await this.ctx.storage.put("messages", history);
		}
	}
}
