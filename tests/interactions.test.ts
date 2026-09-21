import assert from "node:assert/strict";
import test from "node:test";
import { hasRankingConverged, rankingOverlap } from "../lib/interactions/convergence";
import { mergeInteractionEvents } from "../lib/interactions/merge";
import { normalizeUsername } from "../lib/interactions/normalize";
import {
  calculateBalance,
  calculateTimeWeight,
  scoreInteractions,
} from "../lib/interactions/scoring";
import { fetchProvidersSafely } from "../lib/providers/types";
import { fxStatusesToInteractionEvents } from "../lib/providers/fxtwitter";
import { yahooEntriesToInteractionEvents } from "../lib/providers/yahoo";
import { interactionScoresToCircleUsers } from "../lib/yahoo-to-circle";
import type { InteractionEvent } from "../types/interaction";

test("用户名会去除 @、空白并统一为小写", () => {
  assert.equal(normalizeUsername("  @@AcNeKoT  "), "acnekot");
});

test("互动事件按完整键去重并保留多个来源", () => {
  const yahoo: InteractionEvent = {
    tweetId: "1",
    author: "Alice",
    target: "SELF",
    type: "mention",
    source: "yahoo",
  };
  const merged = mergeInteractionEvents([
    [yahoo],
    [
      { ...yahoo, author: "@alice", source: "fxtwitter" },
      { ...yahoo, type: "reply", source: "fxtwitter" },
    ],
  ]);

  assert.equal(merged.length, 2);
  const mention = merged.find((event) => event.type === "mention");
  assert.deepEqual(new Set(mention?.sources), new Set(["yahoo", "fxtwitter"]));
  assert.equal(mention?.author, "alice");
  assert.equal(mention?.target, "self");
});

test("最近互动的时间权重大于几个月前的互动", () => {
  const now = Date.UTC(2026, 8, 21);
  const recent = calculateTimeWeight(now - 2 * 86_400_000, now);
  const old = calculateTimeWeight(now - 120 * 86_400_000, now);
  assert.ok(recent > old);
});

test("双向互动在总量相同时高于单向互动", () => {
  const make = (
    prefix: string,
    other: string,
    inbound: number,
    outbound: number,
  ): InteractionEvent[] => [
    ...Array.from({ length: inbound }, (_, index) => ({
      tweetId: `${prefix}-in-${index}`,
      author: other,
      target: "self",
      type: "mention" as const,
      source: "yahoo" as const,
    })),
    ...Array.from({ length: outbound }, (_, index) => ({
      tweetId: `${prefix}-out-${index}`,
      author: "self",
      target: other,
      type: "mention" as const,
      source: "yahoo" as const,
    })),
  ];
  const scores = scoreInteractions(
    [...make("a", "a", 50, 0), ...make("b", "b", 25, 25)],
    "self",
  );
  const a = scores.find((row) => row.screenName === "a");
  const b = scores.find((row) => row.screenName === "b");
  assert.ok(a && b);
  assert.equal(calculateBalance(a.inbound, a.outbound), 0);
  assert.equal(calculateBalance(b.inbound, b.outbound), 1);
  assert.ok(b.finalScore > a.finalScore);
});

test("Top 30 重合率达到 90% 时判定排名收敛", () => {
  const previous = Array.from({ length: 30 }, (_, index) => `u${index}`);
  const current90 = [...previous.slice(0, 27), "x", "y", "z"];
  const currentBelow = [...previous.slice(0, 26), "w", "x", "y", "z"];
  assert.equal(rankingOverlap(previous, current90), 0.9);
  assert.equal(hasRankingConverged(previous, current90), true);
  assert.equal(hasRankingConverged(previous, currentBelow), false);
});

test("单个 Provider 失败时保留其他 Provider 的结果", async () => {
  const event: InteractionEvent = {
    tweetId: "ok",
    author: "friend",
    target: "self",
    type: "reply",
    source: "yahoo",
  };
  const outcomes = await fetchProvidersSafely(
    [
      { name: "ok", async fetchInteractions() { return [event]; } },
      { name: "broken", async fetchInteractions() { throw new Error("boom"); } },
    ],
    "self",
  );
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["ok", "failed"]);
  assert.deepEqual(outcomes[0]?.events, [event]);
  assert.deepEqual(outcomes[1]?.events, []);
});

test("FxTwitter v2 的 replying_to 和 mention facets 会转换成正确方向", () => {
  const outbound = fxStatusesToInteractionEvents(
    [
      {
        id: "fx-1",
        author: { screen_name: "Self" },
        created_timestamp: 1_789_900_000,
        replying_to: { screen_name: "Friend" },
        raw_text: {
          facets: [{ type: "mention", original: "Friend" }],
        },
      },
    ],
    "self",
    "outbound",
  );
  assert.deepEqual(outbound, [
    {
      tweetId: "fx-1",
      author: "self",
      target: "friend",
      type: "reply",
      createdAt: 1_789_900_000_000,
      source: "fxtwitter",
    },
  ]);
});

test("FxTwitter facets 缺失时仍会从正文识别入站 mention", () => {
  const incoming = fxStatusesToInteractionEvents(
    [
      {
        id: "fx-text-1",
        author: { screen_name: "Friend" },
        text: "hello @Self",
      },
      {
        id: "fx-facet-1",
        author: { screen_name: "Other" },
        raw_text: {
          facets: [{ type: "mention", replacement: "@Self" }],
        },
      },
    ],
    "self",
    "inbound",
  );

  assert.deepEqual(
    incoming.map((event) => [event.tweetId, event.author, event.target]),
    [
      ["fx-text-1", "friend", "self"],
      ["fx-facet-1", "other", "self"],
    ],
  );
});

test("Yahoo 入站会从 URL 补全作者并识别回复", () => {
  const incoming = yahooEntriesToInteractionEvents(
    [
      {
        id: "yahoo-1",
        url: "https://x.com/Friend/status/123",
        replyMentions: ["Self"],
        inReplyTo: "122",
      },
    ],
    [],
    "self",
  );

  assert.deepEqual(incoming, [
    {
      tweetId: "yahoo-1",
      author: "friend",
      target: "self",
      type: "reply",
      createdAt: undefined,
      source: "yahoo",
    },
  ]);
});

test("圈子转换会保留全部评分用户而不是只取前 50 名", async () => {
  const scores = Array.from({ length: 120 }, (_, index) => ({
    screenName: `user_${index}`,
    inbound: 120 - index,
    outbound: 0,
    inboundCount: 1,
    outboundCount: 0,
    interactionCount: 1,
    balance: 0,
    finalScore: 120 - index,
    sources: ["yahoo" as const],
  }));
  const previews = Object.fromEntries(
    scores.map((row) => [row.screenName, `https://example.com/${row.screenName}.jpg`]),
  );

  const users = await interactionScoresToCircleUsers(scores, previews);

  assert.equal(users.length, 120);
  assert.equal(users[119]?.screenName, "user_119");
});
