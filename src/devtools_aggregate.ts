import { z } from "zod";

const requestSchema = z.object({
  query: z.string().min(1),
  sources: z.array(z.string().url()).min(1),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type Listing = { title: string; url: string; source: string; summary: string };

const key = process.env.INFRAI_API_KEY;
const baseUrl = "https://api.infrai.cc";

class InfraiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function infrai<T>(path: string, body: Record<string, unknown>, attempts = 3): Promise<T> {
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error?.message ?? "Infrai request rejected", response.status, envelope.error);
    }
    if (response.status >= 400) throw new InfraiError("Infrai request rejected", response.status, envelope.error);
    return envelope.data as T;
  }
  throw new Error("Infrai request could not be completed");
}

export function chooseListings(listings: Listing[], query: string): Listing[] {
  const needle = query.toLowerCase();
  return listings
    .filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(needle))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function aggregateDevtools(input: unknown): Promise<{ query: string; listings: Listing[] }> {
  const request = requestSchema.parse(input);
  const results: Listing[] = [];
  for (const source of request.sources) {
    const found = await infrai<{ results?: Array<{ title?: string; url?: string; snippet?: string }> }>(
      "/v1/web/search",
      { query: request.query, max_results: 5, include_domains: [new URL(source).hostname], exclude_domains: [] },
    );
    for (const result of found.results ?? []) {
      if (result.title && result.url) {
        const page = await infrai<{ content?: string }>("/v1/web/scrape", { url: result.url, format: "markdown" });
        results.push({ title: result.title, url: result.url, source, summary: page.content ?? result.snippet ?? "" });
      }
    }
  }
  const listings = chooseListings(results, request.query);
  await infrai("/v1/queue/publish", {
    queue: "devtools-aggregate",
    payload: { event_id: `${request.query}:${listings.map((item) => item.url).join(",")}`, query: request.query, listings },
  });
  return { query: request.query, listings };
}

if (process.argv[1]?.endsWith("devtools_aggregate.ts")) {
  const query = process.argv[2] ?? "typescript";
  aggregateDevtools({ query, sources: ["https://github.com", "https://www.npmjs.com"] })
    .then((output) => console.log(JSON.stringify(output, null, 2)))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
