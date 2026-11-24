import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function queryClaude(prompt: string): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: "claude-opus-5-5",
    // Thinking is always on for this model and counts toward max_tokens,
    // so leave room for it plus the answer.
    max_tokens: 16000,
    // A local-recommendation question is a plain chat answer; low effort
    // keeps scans fast and cheap.
    output_config: { effort: "low" },
    // If a safety classifier declines, retry on a fallback model in the
    // same call instead of losing the data point.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") return "";
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text : "";
}
