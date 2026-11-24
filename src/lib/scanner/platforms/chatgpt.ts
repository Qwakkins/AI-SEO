import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function queryChatGPT(prompt: string): Promise<string> {
  const response = await getClient().chat.completions.create({
    // OpenAI's recommended replacement for gpt-4o-mini (shut down 2027-01-14)
    model: "gpt-6-luna",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 4096,
  });

  return response.choices[0]?.message?.content || "";
}
