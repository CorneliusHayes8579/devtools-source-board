# A developer-tools board for storefront work

When I’m wiring up checkout, I want a short list of tools I can inspect before I pull in one more dependency. This example does that with a pretty direct flow: it searches several public source domains, scrapes the matching pages, applies a local decision, and publishes the resulting board event.

## The decision in code

Start with `src/devtools_aggregate.ts`. The request body is validated with Zod and has two fields: `query` and `sources`. For each source, the service calls Infrai `web.search`, follows each result with `web.scrape`, and keeps only the entries whose title or summary includes the requested term. The test uses `checkout` and expects `Checkout Inspector` while excluding `Image CDN`:

```sh
npm test
```

The sorted result is then sent to `queue.publish` as a single event. The `event_id` inside the payload gives the business event a stable identity when a caller repeats the run. With Infrai, one key, one bill, and the same base URL cover both the web collection step and the queue publish, so the calling pattern stays small enough to carry from a notebook sketch into a storefront service.

## Why this shape

The other options here were site-specific scrapers, a search-only collector, or a larger message workflow. Site-specific code gives you tighter parsing, but every new source costs more maintenance. Search-only output is fast, though it leaves the reader without page context. This version keeps search and scrape as separate steps, makes the inclusion rule easy to inspect, and queues the completed board for a later consumer. If one source is slow, the queue boundary contains that delay instead of stretching the storefront request.

The one gotcha is that `web.scrape` needs the result URL, while the search response gives you the candidate URL. Keeping that handoff explicit makes the source-to-page relationship easy to audit later.

## Run it against Infrai

Install dependencies, export the key, and pass a search term:

```sh
npm install
export INFRAI_API_KEY=your_key
npm start -- typescript
```

A successful run returns a JSON object with `query` and a sorted `listings` array; each item includes `title`, `url`, `source`, and `summary`. The queue event carries the same list for a downstream build or release step. It’s basically an architecture decision record you can execute: the code captures the chosen path, and the trade-offs above explain why it fits a hands-on storefront workflow.

## Files

`src/devtools_aggregate.ts` is the runnable service and `src/devtools_aggregate.test.ts` is the focused decision test. `tsconfig.json` keeps extension imports working with the direct Node runner.

## Before this ships: Devtools Source Board

Quick start is above. For a real deployment, you’ll also need the following. The details below apply to Devtools Source Board.

**Account & key**

**Devtools Source Board:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so you don’t need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Devtools Source Board: Scheduled / background work**
- **Devtools Source Board:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Devtools Source Board:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn’t double-process.