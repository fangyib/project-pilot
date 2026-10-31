import { trialFiles, type ModelProvider, type ProviderRequest, type ProviderResult } from "./fixtures.js";

export type { ModelProvider };

export class TrialProvider implements ModelProvider {
  async execute(request: ProviderRequest): Promise<ProviderResult> {
    return {
      files: await trialFiles(request),
      logs: [`本地试用执行器完成“${request.title}”，未调用外部模型。`],
      costCents: 0,
    };
  }
}

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(private readonly options: { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch }) {}

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const files: Record<string, string> = {};
    const logs: string[] = [];
    const messages: unknown[] = [
      { role: "system", content: "你是项目工作台的执行器。只通过 write_file 写入约定路径，完成后调用 complete。写出的页面必须就是用户要的那个程序，不要改成与想法无关的通用示例。每个 write_file 只写一个文件，content 必须是完整内容。页面入口保持短小，把脚本放到单独文件，不要把整份程序内联进一次调用。" },
      { role: "user", content: `${request.idea ? `用户要的程序：${request.idea}\n` : ""}${request.title}\n${request.acceptance}${request.fileScope?.length ? `\n必须写入这些路径：${request.fileScope.join("、")}` : ""}${request.note ? `\n用户补充：${request.note}` : ""}` },
    ];
    const tools = [
      { type: "function", function: { name: "write_file", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
      { type: "function", function: { name: "complete", parameters: { type: "object", properties: { summary: { type: "string" } } } } },
    ];
    const fetchImpl = this.options.fetchImpl ?? fetch;
    for (let step = 0; step < 8; step += 1) {
      await request.checkpoint?.();
      const response = await fetchImpl(joinUrl(this.options.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.options.model, messages, tools, max_tokens: 8192 }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
      const body = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string | null; reasoning_content?: string; tool_calls?: ToolCall[] } }[] };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error("模型没有返回内容");
      messages.push(message);
      if (!message.tool_calls?.length) {
        const reply = (message.content ?? "").trim() || (message.reasoning_content ?? "").trim();
        if (reply) logs.push(reply);
        const saved = textFileFromReply(reply, request.fileScope);
        const [savedPath] = Object.keys(saved);
        if (savedPath) {
          files[savedPath] = saved[savedPath];
          logs.push(`写入 ${savedPath}`);
        }
        break;
      }
      for (const call of message.tool_calls) {
        const parsed = parseToolArguments(call.function.arguments);
        if (!parsed.ok) {
          messages.push({ role: "tool", tool_call_id: call.id, content: "这次参数不是完整的 JSON，文件没有写入。请缩短内容，分成多个较小的 write_file 重新写入。" });
          logs.push(body.choices?.[0]?.finish_reason === "length" ? "模型输出被截断，已要求重写" : "模型返回的文件内容不完整，已要求重写");
          continue;
        }
        const args = parsed.value;
        if (call.function.name === "write_file" && args.path && typeof args.content === "string") {
          files[args.path] = args.content;
          logs.push(`写入 ${args.path}`);
          messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        } else if (call.function.name === "complete") {
          logs.push(args.summary || "执行完成");
          return { files, logs, costCents: 1 };
        } else {
          messages.push({ role: "tool", tool_call_id: call.id, content: "没有执行。write_file 需要 path 和 content。" });
        }
      }
    }
    if (!Object.keys(files).length) throw new Error("模型没有把文件写下来");
    return { files, logs, costCents: 1 };
  }
}

export function parseToolArguments(raw: unknown): { ok: true; value: { path?: string; content?: string; summary?: string } } | { ok: false } {
  const text = typeof raw === "string" ? raw : raw && typeof raw === "object" ? JSON.stringify(raw) : "";
  try {
    const value = JSON.parse(text.trim() || "{}") as { path?: string; content?: string; summary?: string };
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function textFileFromReply(reply: string, fileScope?: string[]): Record<string, string> {
  const text = reply.trim();
  if (!fileScope || fileScope.length !== 1 || text.length < 40) return {};
  const fence = text.match(/^```[\w./-]*\n([\s\S]*?)\n```$/);
  return { [fileScope[0]]: fence?.[1]?.trim() || text };
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, "")}${suffix}`;
}

export type { ProviderRequest };
