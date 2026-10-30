import test from "node:test";
import assert from "node:assert/strict";
import { decideChange, digestPage, WatchRequest } from "./media_change_monitor.ts";

test("a new page digest is the delivery decision", () => {
  const oldDigest = digestPage("episode one");
  const sameDigest = digestPage("episode one");
  const newDigest = digestPage("episode two");
  assert.equal(decideChange(oldDigest, sameDigest), false);
  assert.equal(decideChange(oldDigest, newDigest), true);
  assert.equal(WatchRequest.parse({ url: "https://media.example/show", recipient: "creator@example.com", subject: "Changed" }).url, "https://media.example/show");
});
