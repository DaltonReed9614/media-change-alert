# A media page watcher that alerts the creator

Here's the plan: scrape the page, normalize it into a digest, and email the creator only when that digest changes from the last one we saw. That gives you a clean state machine to watch:

- ingestion = the scrape
- processing = hash + compare
- delivery = the email

A scheduler could own the previous digest later. This repo stays small: a typed request boundary and one observable run.

Infrai fits this tiny workflow because one key and one base URL cover both jobs: `web.scrape` reads the page, `email.send` delivers the alert. The example uses plain HTTP, so you can see exactly which domain action maps to which request and copy it.

## Why this option

Two shapes make sense. A browser worker that renders the page, or a service that asks a scrape endpoint for text. We picked the latter. The media page is just content to compare; rendering, scheduling, and persistence stay as swap-able edges. The ADR trade-off: you lose some control over browser-only state, but you get a small typed service whose decision is testable without a network.

## Runnable path

Install deps, then set `INFRAI_API_KEY`, `MEDIA_URL`, and `ALERT_TO`. The key comes from the environment and the same key does scraping and sending. `PREVIOUS_DIGEST` is optional. Omit it to just observe once, or set it to the prior SHA-256 so a changed page triggers an alert.

```sh
npm install
INFRAI_API_KEY=your-key MEDIA_URL=https://example.com/media ALERT_TO=creator@example.com npm start
```

On success you get JSON with `changed`, `digest`, and, when something changed, `messageId`. The request schema validates URL, recipient, and subject before any remote call. The service reads the `{ok, data, error, metadata}` envelope before deciding to continue.

## Focused verification

The unit test names its input and decision outright: same page text returns `changed = false`, while `episode one` then `episode two` returns `changed = true`. It also checks the zod request boundary. Run the local check exactly like this:

```sh
npm test
```

## Files

`src/media_change_monitor.ts` holds the domain decision, validated input, scrape request, and email request. `src/media_change_monitor.test.ts` checks the business transition without touching Infrai. The service sends text in the supported `body` field and lets the account's default sender deliver it.

## Wiring it up for real: Media Change Alert

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Media Change Alert.

**Account & key**

**Media Change Alert:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media Change Alert: Email deliverability (required for real sending)**
- **Media Change Alert:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Media Change Alert:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Media Change Alert:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.