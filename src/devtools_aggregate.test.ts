import test from "node:test";
import assert from "node:assert/strict";
import { chooseListings } from "./devtools_aggregate.ts";

test("the storefront-facing board keeps only listings matching the requested tool", () => {
  const result = chooseListings([
    { title: "Checkout Inspector", url: "https://a.test", source: "a", summary: "typescript checkout diagnostics" },
    { title: "Image CDN", url: "https://b.test", source: "b", summary: "asset delivery" },
  ], "checkout");
  assert.deepEqual(result.map((item) => item.title), ["Checkout Inspector"]);
});
