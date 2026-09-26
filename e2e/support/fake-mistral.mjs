/**
 * A stand-in for the Mistral chat-completions API so end-to-end tests are
 * deterministic and free. It reads the same prompt the real model gets and
 * extracts the service, date and time with simple rules.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_MISTRAL_PORT ?? 4010);
const SERVICES = ["haircut", "beard trim"];

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);

  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

function extract(systemPrompt, message) {
  const today = systemPrompt.match(/Current local date and time: (\d{4}-\d{2}-\d{2})/)?.[1];
  const text = message.toLowerCase();
  const serviceName = SERVICES.find((service) => text.includes(service)) ?? null;
  const explicitDate = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const scheduledDate = explicitDate ?? (text.includes("tomorrow") && today ? addDays(today, 1) : null);
  const time = text.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  let scheduledTime = null;

  if (time) {
    let hour = Number(time[1]);

    if (time[3] === "pm" && hour < 12) hour += 12;
    if (time[3] === "am" && hour === 12) hour = 0;
    scheduledTime = `${String(hour).padStart(2, "0")}:${time[2] ?? "00"}`;
  }

  if (!serviceName && !scheduledDate) {
    return {
      intent: "OUT_OF_SCOPE",
      serviceName: null,
      scheduledDate: null,
      scheduledTime: null,
      durationMinutes: null,
      notes: null,
      clarificationQuestion: null,
      assistantReply: "I can only help with booking appointments.",
      confidence: 0.9,
    };
  }

  return {
    intent: "BOOK_APPOINTMENT",
    serviceName,
    scheduledDate,
    scheduledTime,
    durationMinutes: null,
    notes: null,
    clarificationQuestion: scheduledDate && scheduledTime ? null : "What day and time would you like?",
    assistantReply: null,
    confidence: 0.9,
  };
}

createServer((request, response) => {
  let body = "";

  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }

    const { messages } = JSON.parse(body);
    const system = messages.find((item) => item.role === "system")?.content ?? "";
    const lastUser = messages.filter((item) => item.role === "user").at(-1)?.content ?? "";
    const content = JSON.stringify(extract(system, lastUser));

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "e2e",
        model: "mistral-small-e2e",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      }),
    );
  });
}).listen(PORT, () => console.log(`fake Mistral on ${PORT}`));
