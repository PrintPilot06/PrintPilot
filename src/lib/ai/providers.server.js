/** Provider-independent chat adapter. Runs server-side only. */

function joinUrl(base, path) {
  const clean = String(base || "").replace(/\/+$/, "");
  return `${clean}${path}`;
}

function safeParse(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function readError(res, label) {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 400);
  } catch {
    detail = "";
  }
  throw new Error(`${label} rejected the request (${res.status}). ${detail}`);
}

async function openaiLike({ model, apiKey, baseUrl, messages, tools, system, label, extraHeaders }) {
  if (!baseUrl) throw new Error("This provider needs a base URL.");
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => {
        if (m.role === "assistant") {
          const entry = { role: "assistant", content: m.content || "" };
          if (m.toolCalls?.length) {
            entry.tool_calls = m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
            }));
          }
          return entry;
        }
        if (m.role === "tool") {
          return { role: "tool", tool_call_id: m.toolCallId, content: String(m.content ?? "") };
        }
        return { role: "user", content: String(m.content ?? "") };
      }),
    ],
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  const res = await fetch(joinUrl(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      ...(extraHeaders || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey || "local"}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res, label);
  const json = await res.json();
  const message = json.choices?.[0]?.message || {};
  return {
    content: message.content || "",
    toolCalls: (message.tool_calls || []).map((tc, index) => ({
      id: tc.id || `call-${Date.now()}-${index}`,
      name: tc.function?.name,
      args: safeParse(tc.function?.arguments),
    })),
  };
}

async function anthropic({ model, apiKey, messages, tools, system }) {
  if (!apiKey) throw new Error("Anthropic needs an API key.");
  const mapped = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: String(m.content ?? "") };
      const last = mapped[mapped.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else mapped.push({ role: "user", content: [block] });
      continue;
    }
    if (m.role === "assistant") {
      const blocks = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls || []) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args || {} });
      }
      mapped.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "…" }] });
      continue;
    }
    mapped.push({ role: "user", content: String(m.content ?? "") });
  }
  const body = {
    model,
    max_tokens: 2048,
    temperature: 0.2,
    system,
    messages: mapped,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res, "Anthropic");
  const json = await res.json();
  let content = "";
  const toolCalls = [];
  for (const block of json.content || []) {
    if (block.type === "text") content += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, args: block.input || {} });
    }
  }
  return { content, toolCalls };
}

async function gemini({ model, apiKey, messages, tools, system }) {
  if (!apiKey) throw new Error("Gemini needs an API key.");
  const contents = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const part = {
        functionResponse: { name: m.name || "tool", response: { result: String(m.content ?? "") } },
      };
      const last = contents[contents.length - 1];
      if (last && last.role === "user") last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
      continue;
    }
    if (m.role === "assistant") {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls || []) {
        parts.push({ functionCall: { name: tc.name, args: tc.args || {} } });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "…" }] });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: String(m.content ?? "") }] });
  }
  const body = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.2 },
  };
  if (tools?.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res, "Gemini");
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  let content = "";
  const toolCalls = [];
  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `call-${Date.now()}-${toolCalls.length}`,
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    }
  }
  return { content, toolCalls };
}

export async function callChatProvider({ provider, model, apiKey, baseUrl, messages, tools, system }) {
  if (!model) throw new Error("Choose a model for this provider.");
  if (provider === "anthropic") return anthropic({ model, apiKey, messages, tools, system });
  if (provider === "gemini") return gemini({ model, apiKey, messages, tools, system });
  if (provider === "openai") {
    return openaiLike({
      model,
      apiKey,
      baseUrl: "https://api.openai.com/v1",
      messages,
      tools,
      system,
      label: "OpenAI",
    });
  }
  return openaiLike({
    model,
    apiKey,
    baseUrl,
    messages,
    tools,
    system,
    label: provider === "local" ? "Local server" : "Provider",
  });
}

/** One tool-calling turn on the Base44 AI gateway — no API key, billed to app AI credits. */
export async function callGatewayChat({ base44, model, messages, tools, system }) {
  const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
  return openaiLike({
    model: model || "automatic",
    apiKey: token,
    baseUrl: baseURL,
    extraHeaders: headers,
    messages,
    tools,
    system,
    label: "PrintPilot AI",
  });
}