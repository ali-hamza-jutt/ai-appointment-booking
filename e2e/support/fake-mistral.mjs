/**
 * A stand-in for Mistral's chat-completions API with function calling, so
 * end-to-end tests are deterministic and free. It plays a simple, correct
 * booking agent: find the service, check the requested day and time, hold it.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_MISTRAL_PORT ?? 4010);
/** Pause between streamed chunks, to watch replies arrive when running locally. */
const CHUNK_DELAY_MS = Number(process.env.FAKE_MISTRAL_CHUNK_DELAY_MS ?? 0);
const SERVICES = ["haircut", "beard trim"];
let callSequence = 0;

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);

  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

function parseRequest(systemPrompt, message) {
  const today = systemPrompt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const todayIso = today ? `${today[3]}-${today[1]}-${today[2]}` : null;
  const text = message.toLowerCase();
  const service = SERVICES.find((name) => text.includes(name)) ?? null;
  const date = text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? (text.includes("tomorrow") && todayIso ? addDays(todayIso, 1) : null);
  const time = text.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  let hhmm = null;

  if (time) {
    let hour = Number(time[1]);

    if (time[3] === "pm" && hour < 12) hour += 12;
    if (time[3] === "am" && hour === 12) hour = 0;
    hhmm = `${String(hour).padStart(2, "0")}:${time[2] ?? "00"}`;
  }

  return { service, date, time: hhmm };
}

function toolCall(name, args) {
  callSequence += 1;

  return { id: `fk${String(callSequence).padStart(7, "0")}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

/** Decides the next step from the messages since the customer's latest message. */
function nextStep(messages) {
  const system = messages.find((item) => item.role === "system")?.content ?? "";
  const lastUserIndex = messages.map((item) => item.role).lastIndexOf("user");
  const request = parseRequest(system, messages[lastUserIndex]?.content ?? "");
  const results = Object.fromEntries(
    messages
      .slice(lastUserIndex + 1)
      .filter((item) => item.role === "tool")
      .map((item) => [item.name, JSON.parse(item.content)]),
  );

  if (!request.service) return { content: "I can only help with booking appointments here." };
  if (!results.search_services) return { tool_calls: [toolCall("search_services", { query: request.service })] };
  if (!request.date || !request.time) return { content: "What day and time would you like?" };

  const serviceId = results.search_services.services?.[0]?.serviceId;

  if (!results.get_availability) {
    return { tool_calls: [toolCall("get_availability", { serviceId, date: request.date, time: request.time })] };
  }

  const requested = results.get_availability.requested;

  if (!results.propose_booking && requested?.available) {
    return { tool_calls: [toolCall("propose_booking", { slotToken: requested.slotToken })] };
  }

  if (results.propose_booking) return { content: "It's held for you. Press Confirm booking to book it." };

  return { content: "That time isn't open. Here are the nearest times." };
}

createServer((request, response) => {
  let body = "";

  request.on("data", (chunk) => (body += chunk));
  request.on("end", async () => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }

    const payload = JSON.parse(body);
    const step = nextStep(payload.messages);
    const finishReason = step.tool_calls ? "tool_calls" : "stop";
    const usage = { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 };

    if (payload.stream) {
      // Server-sent chunks, as Mistral streams them: text a few words at a time.
      const words = (step.content ?? "").match(/\S+\s*/g) ?? [];
      const chunks = [
        ...words.map((word) => ({ choices: [{ index: 0, delta: { content: word } }] })),
        ...(step.tool_calls ? [{ choices: [{ index: 0, delta: { tool_calls: step.tool_calls.map((call, index) => ({ index, ...call })) } }] }] : []),
        { model: "mistral-small-e2e", choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage },
      ];

      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const chunk of chunks) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (CHUNK_DELAY_MS) await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      }
      response.end("data: [DONE]\n\n");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "e2e",
        model: "mistral-small-e2e",
        choices: [{ index: 0, message: { role: "assistant", content: step.content ?? "", ...(step.tool_calls ? { tool_calls: step.tool_calls } : {}) }, finish_reason: finishReason }],
        usage,
      }),
    );
  });
}).listen(PORT, () => console.log(`fake Mistral on ${PORT}`));
