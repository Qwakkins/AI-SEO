import { getSupabase } from "@/lib/supabase";
import { queryChatGPT } from "./platforms/chatgpt";
import { queryClaude } from "./platforms/claude";
import { queryGemini } from "./platforms/gemini";
import { queryPerplexity } from "./platforms/perplexity";
import { analyzeResponse } from "./analyzer";

type Platform = "chatgpt" | "claude" | "gemini" | "perplexity";

const platformQueryFns: Record<Platform, (prompt: string) => Promise<string>> = {
  chatgpt: queryChatGPT,
  claude: queryClaude,
  gemini: queryGemini,
  perplexity: queryPerplexity,
};

function getAvailablePlatforms(): Platform[] {
  const platforms: Platform[] = [];
  if (process.env.OPENAI_API_KEY) platforms.push("chatgpt");
  if (process.env.ANTHROPIC_API_KEY) platforms.push("claude");
  if (process.env.GEMINI_API_KEY) platforms.push("gemini");
  if (process.env.PERPLEXITY_API_KEY) platforms.push("perplexity");
  return platforms;
}

export interface ScanResult {
  platform: Platform;
  query: string;
  response: string;
  business_mentioned: boolean;
  mention_context: string | null;
  position_in_response: number | null;
  competitors_mentioned: string[];
}

export async function scanBusiness(businessId: string): Promise<ScanResult[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not configured");

  // Get the business
  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();

  if (bizError || !business) throw new Error("Business not found");

  // Get active tracking queries
  const { data: queries, error: queryError } = await supabase
    .from("tracking_queries")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true);

  if (queryError || !queries?.length) throw new Error("No active tracking queries");

  const platforms = getAvailablePlatforms();
  if (platforms.length === 0) throw new Error("No AI platform API keys configured");

  const results: ScanResult[] = [];

  for (const query of queries) {
    for (const platform of platforms) {
      try {
        const queryFn = platformQueryFns[platform];
        const response = await queryFn(query.query_template);
        const analysis = analyzeResponse(response, business.name);

        // Store in database
        await supabase.from("query_results").insert({
          tracking_query_id: query.id,
          platform,
          response_text: response,
          business_mentioned: analysis.business_mentioned,
          mention_context: analysis.mention_context,
          position_in_response: analysis.position_in_response,
          competitors_mentioned: analysis.competitors_mentioned,
        });

        results.push({
          platform,
          query: query.query_template,
          response,
          ...analysis,
        });
      } catch (err) {
        console.error(`Error scanning ${platform} for "${query.query_template}":`, err);
      }
    }
  }

  return results;
}
