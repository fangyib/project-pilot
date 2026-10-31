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
      { role: "system", content: "你是项目工作台的执行器。只通过 write_file 写入约定路径，完成后调用 complete。写出的页面必须就是用户要的那个程序，不要改成与想法无关的通用示例。" },
      { role: "user", content: `${request.idea ? `用户要的程序：${request.idea}\n` : ""}${request.title}\n${request.acceptance}${request.fileScope?.length ? `\n必须写入这些路径：${request.fileScope.join("、")}` : ""}${request.note ? `\n用户补充：${request.note}` : ""}` },
    ];
    const tools = [
      { type: "function", function: { name: "write_file", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
      { type: "function", function: { name: "complete", parameters: { type: "object", properties: { summary: { type: "string" } } } } },
    ];
    const fetchImpl = this.options.fetchImpl ?? fetch;
    for (let step = 0; step < 6; step += 1) {
      await request.checkpoint?.();
      const response = await fetchImpl(joinUrl(this.options.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.options.model, messages, tools }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
      const body = await response.json() as { choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[] };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error("模型没有返回内容");
      messages.push(message);
      if (!message.tool_calls?.length) {
        if (message.content) logs.push(message.content);
        break;
      }
      for (const call of message.tool_calls) {
        const args = JSON.parse(call.function.arguments || "{}") as { path?: string; content?: string; summary?: string };
        if (call.function.name === "write_file" && args.path && typeof args.content === "string") {
          files[args.path] = args.content;
          logs.push(`写入 ${args.path}`);
          messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        } else if (call.function.name === "complete") {
          logs.push(args.summary || "执行完成");
          return { files, logs, costCents: 1 };
        }
      }
    }
    if (!Object.keys(files).length) throw new Error("模型没有写入任何文件");
    return { files, logs, costCents: 1 };
  }
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, "")}${suffix}`;
}

export type { ProviderRequest };
