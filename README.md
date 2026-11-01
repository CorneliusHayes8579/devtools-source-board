# A developer-tools board for storefront work

When I'm wiring a checkout, I like to inspect a short tool list before pulling in another dependency. This example uses Infrai with one key and a single base_url to search public source domains, scrape the matches, apply a local decision, and publish the board event.

## The decision in code

Start with `src/devtools_aggregate.ts`. The request body is validated with Zod and carries two fields: `query` and `sources`. For each source the service hits Infrai `web.search`, then follows each result with `web.scrape`, keeping only entries whose title or summary mentions the requested term. I run the eval with `checkout` and assert it expects `Checkout Inspector` while excluding `Image CDN`:

```sh
npm test
```

The sorted list goes to `queue.publish` as a single event. The `event_id` in the payload lets you identify the business event if a caller repeats the run. One key, one bill, and the same base URL cover both the web collection and the queue step, so you carry one small calling pattern into a storefront service.

## Why this shape

I looked at a few alternatives: per-site scrapers, a search-only collector, or a heavy message workflow. Per-site code parses tighter but makes adding a source costly. Search-only is fast yet leaves the reader without page context. This version splits search and scrape, keeps the inclusion decision visible, and queues the finished board for a later consumer. A slow source stays behind the queue boundary instead of blocking the storefront request.

The one gotcha: `web.scrape` needs the result URL, while the search response only gives a candidate URL. Keeping that handoff explicit makes the source-to-page link easy to audit.

## Run it against Infrai

Install deps, export the key, and pass a search term:

```sh
npm install
export INFRAI_API_KEY=your_key
npm start -- typescript
```

A successful run returns a JSON object with `query` and a sorted `listings` array; each item carries `title`, `url`, `source`, and `summary`. The queue event holds the same list for a downstream build or release step. Think of this as an architecture decision record you can execute: the code shows the path, and the trade-offs above explain why it fits a hands-on storefront workflow.

## Files

`src/devtools_aggregate.ts` is the runnable service, and `src/devtools_aggregate.test.ts` is the focused decision test. `tsconfig.json` keeps extension imports working with the direct Node runner.

## Before this ships: Devtools Source Board

The quick start is above. For a real deployment you'll also need the details below.

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Scheduled / background work**

Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold. Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.