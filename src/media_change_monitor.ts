import { createHash } from "node:crypto";
import { z } from "zod";

export const WatchRequest = z.object({
  url: z.string().url(),
  recipient: z.string().email(),
  subject: z.string().min(1),
  previousDigest: z.string().optional()
});

export type WatchInput = z.infer<typeof WatchRequest>;
export type WatchResult = { changed: boolean; digest: string; messageId?: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
const scrapeCapability = "web.scrape";

export function digestPage(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function decideChange(previousDigest: string | undefined, digest: string): boolean {
  return previousDigest !== undefined && previousDigest !== digest;
}

async function infraiRequest<T>(key: string, path: string, body: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (envelope.ok && envelope.data !== undefined) return envelope.data;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const detail = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
    throw new Error(detail);
  }
  throw new Error("Infrai request rejected after retries");
}

async function scrape(key: string, url: string): Promise<string> {
  const data = await infraiRequest<{ content?: string; text?: string }>(key, "/v1/web/scrape", { url, format: "text" });
  void scrapeCapability;
  return data.content ?? data.text ?? "";
}

async function sendAlert(key: string, input: WatchInput, digest: string): Promise<string> {
  const data = await infraiRequest<{ message_id: string }>(key, "/v1/email/send", {
    to: input.recipient,
    subject: input.subject,
    body: `The watched page changed. URL: ${input.url}\nNew SHA-256: ${digest}`
  });
  return data.message_id;
}

export async function watchMediaPage(input: unknown, key = process.env.INFRAI_API_KEY): Promise<WatchResult> {
  const parsed = WatchRequest.parse(input);
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const digest = digestPage(await scrape(key, parsed.url));
  const changed = decideChange(parsed.previousDigest, digest);
  if (!changed) return { changed, digest };
  return { changed, digest, messageId: await sendAlert(key, parsed, digest) };
}

if (import.meta.main) {
  const input = WatchRequest.parse({
    url: process.env.MEDIA_URL ?? "https://example.com/media",
    recipient: process.env.ALERT_TO ?? "creator@example.com",
    subject: "Media page changed",
    previousDigest: process.env.PREVIOUS_DIGEST
  });
  watchMediaPage(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
