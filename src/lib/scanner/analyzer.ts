export interface AnalysisResult {
  business_mentioned: boolean;
  mention_context: string | null;
  position_in_response: number | null;
  competitors_mentioned: string[];
}

export function analyzeResponse(
  response: string,
  businessName: string
): AnalysisResult {
  const lowerResponse = response.toLowerCase();
  const lowerName = businessName.toLowerCase();

  // Check for exact match
  const nameIndex = lowerResponse.indexOf(lowerName);
  const mentioned = nameIndex !== -1;

  let mentionContext: string | null = null;
  let position: number | null = null;

  if (mentioned) {
    // Extract the sentence containing the mention
    const sentences = response.split(/[.!?\n]+/);
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].toLowerCase().includes(lowerName)) {
        mentionContext = sentences[i].trim();
        position = i + 1;
        break;
      }
    }
  }

  // Extract other business names mentioned (lines starting with numbers, bold text, etc.)
  const competitors: string[] = [];
  const patterns = [
    /\*\*([^*]+)\*\*/g,           // **Business Name**
    /\d+\.\s+\*?\*?([^*\n-]+)/g, // 1. Business Name or 1. **Business Name**
    /[-•]\s+\*?\*?([^*\n]+)/g,   // - Business Name
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const name = match[1].trim().replace(/\*+/g, "").trim();
      if (
        name.length > 2 &&
        name.length < 80 &&
        name.toLowerCase() !== lowerName &&
        !competitors.includes(name)
      ) {
        competitors.push(name);
      }
    }
  }

  return {
    business_mentioned: mentioned,
    mention_context: mentionContext,
    position_in_response: position,
    competitors_mentioned: competitors.slice(0, 20),
  };
}
