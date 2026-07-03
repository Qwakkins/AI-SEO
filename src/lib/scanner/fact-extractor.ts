/**
 * fact-extractor.ts
 *
 * Extracts factual claims (phones, addresses, websites, services) from AI
 * responses about businesses using regex.  Intentionally conservative —
 * missing a claim is acceptable; false extraction is not.
 */

export interface ExtractedFacts {
  phones: string[];
  addresses: string[];
  websites: string[];
  services: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a URL or bare domain to a canonical "host-only" form so that
 * duplicates like `https://www.example.com/page` and `example.com` collapse
 * to the same key.
 */
function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Phone extraction
// ---------------------------------------------------------------------------

const PHONE_RE =
  /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;

function extractPhones(text: string): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const match of text.matchAll(PHONE_RE)) {
    const raw = match[0].trim();
    const key = `${match[1]}${match[2]}${match[3]}`;
    if (!seen.has(key)) {
      seen.add(key);
      phones.push(raw);
    }
  }

  return phones;
}

// ---------------------------------------------------------------------------
// Address extraction
// ---------------------------------------------------------------------------

const STREET_TYPES =
  "St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Rd|Road|Ln|Lane|Way|Court|Ct|Place|Pl";

const ADDRESS_RE = new RegExp(
  `\\d+\\s+(?:[A-Za-z]+\\s+)+(?:${STREET_TYPES})\\b[.,]?(?:\\s+(?:Suite|Ste|Apt|Unit|#)\\s*[\\w-]+)?`,
  "gi"
);

function extractAddresses(text: string): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const match of text.matchAll(ADDRESS_RE)) {
    const raw = match[0].trim().replace(/[.,]+$/, "");
    if (raw.length >= 5 && raw.length <= 200 && !seen.has(raw.toLowerCase())) {
      seen.add(raw.toLowerCase());
      addresses.push(raw);
    }
  }

  return addresses;
}

// ---------------------------------------------------------------------------
// Website extraction
// ---------------------------------------------------------------------------

/** Matches `https?://…` URLs. */
const URL_RE = /https?:\/\/[^\s<>"')\],]+/gi;

/** Matches bare domains like `example.com`, `example.net`, etc. */
const BARE_DOMAIN_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|us|biz|info|app|dev|ai)\b/gi;

/** Trailing punctuation that shouldn't be part of a URL. */
const TRAILING_PUNCT_RE = /[.,;:!?)'"]+$/;

function extractWebsites(text: string): string[] {
  const byDomain = new Map<string, string>(); // normalized domain → first raw value

  const addCandidate = (raw: string) => {
    const cleaned = raw.replace(TRAILING_PUNCT_RE, "");
    const domain = normalizeDomain(cleaned);
    if (domain && !byDomain.has(domain)) {
      byDomain.set(domain, cleaned);
    }
  };

  for (const match of text.matchAll(URL_RE)) addCandidate(match[0]);
  for (const match of text.matchAll(BARE_DOMAIN_RE)) addCandidate(match[0]);

  return Array.from(byDomain.values());
}

// ---------------------------------------------------------------------------
// Service extraction
// ---------------------------------------------------------------------------

/** Lines that look like bullet or numbered list items. */
const LIST_ITEM_RE = /^(?:[-•*]|\d+\.)\s+(.+)/;

/**
 * Inline patterns: "offers/provides/specializes in/known for/services include
 * X, Y, and Z".
 */
const INLINE_SERVICE_RE =
  /(?:offers?|provides?|specializes?\s+in|known\s+for|services?\s+include)\s+([^.!?\n]+)/gi;

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function addService(
  raw: string,
  seen: Set<string>,
  services: string[]
): void {
  const cleaned = cleanMarkdown(raw.trim());
  const key = cleaned.toLowerCase();
  if (cleaned.length >= 2 && cleaned.length <= 100 && !seen.has(key)) {
    seen.add(key);
    services.push(cleaned);
  }
}

function extractServices(text: string): string[] {
  const seen = new Set<string>();
  const services: string[] = [];

  // 1. Bullet / numbered list items
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(LIST_ITEM_RE);
    if (m) addService(m[1], seen, services);
  }

  // 2. Inline "offers X, Y, and Z" patterns
  for (const match of text.matchAll(INLINE_SERVICE_RE)) {
    const segment = match[1];
    // Split on commas and "and"
    for (const part of segment.split(/,\s*(?:and\s+)?|\s+and\s+/)) {
      addService(part.trim(), seen, services);
    }
  }

  return services;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract factual claims from an AI response about a business.
 *
 * Extraction is intentionally conservative: structured/formatted content is
 * preferred over prose parsing, so missing a claim is preferred over a false
 * positive.
 */
export function extractFacts(responseText: string): ExtractedFacts {
  return {
    phones: extractPhones(responseText),
    addresses: extractAddresses(responseText),
    websites: extractWebsites(responseText),
    services: extractServices(responseText),
  };
}
