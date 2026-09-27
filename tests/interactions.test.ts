import assert from "node:assert/strict";
import test from "node:test";
import { hasRankingConverged, rankingOverlap } from "../lib/interactions/convergence";
import { mergeInteractionEvents } from "../lib/interactions/merge";
import { normalizeUsername } from "../lib/interactions/normalize";
import {
  INBOUND_DIRECTION_WEIGHT,
  OUTBOUND_DIRECTION_WEIGHT,
  calculateBalance,
  calculateTimeWeight,
  scoreInteractions,
} from "../lib/interactions/scoring";
import { fetchProvidersSafely } from "../lib/providers/types";
import { fxStatusesToInteractionEvents } from "../lib/providers/fxtwitter";
import { yahooEntriesToInteractionEvents } from "../lib/providers/yahoo";
import { interactionScoresToCircleUsers } from "../lib/yahoo-to-circle";
import { yahooToAnalysisResult } from "../lib/circle-convert";
import { getShareUrl } from "../lib/share-link";
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
    text: "short",
    source: "yahoo",
  };
  const merged = mergeInteractionEvents([
    [yahoo],
    [
      { ...yahoo, author: "@alice", text: "a longer public excerpt", source: "fxtwitter" },
      { ...yahoo, type: "reply", source: "fxtwitter" },
    ],
  ]);

  assert.equal(merged.length, 2);
  const mention = merged.find((event) => event.type === "mention");
  assert.deepEqual(new Set(mention?.sources), new Set(["yahoo", "fxtwitter"]));
  assert.equal(mention?.author, "alice");
  assert.equal(mention?.target, "self");
  assert.equal(mention?.text, "a longer public excerpt");
});

test("最近互动的时间权重大于几个月前的互动", () => {
  const now = Date.UTC(2026, 8, 21);
  const recent = calculateTimeWeight(now - 2 * 86_400_000, now);
  const old = calculateTimeWeight(now - 120 * 86_400_000, now);
  assert.ok(recent > old);
});

test("时间权重按 0–2 天、3–5 天和更早互动分档并持续衰减", () => {
  const now = Date.UTC(2026, 8, 21);
  const day1 = calculateTimeWeight(now - 1 * 86_400_000, now);
  const day2 = calculateTimeWeight(now - 2 * 86_400_000, now);
  const day3 = calculateTimeWeight(now - 3 * 86_400_000, now);
  const day5 = calculateTimeWeight(now - 5 * 86_400_000, now);
  const day10 = calculateTimeWeight(now - 10 * 86_400_000, now);
  const day30 = calculateTimeWeight(now - 30 * 86_400_000, now);
  assert.equal(day1, 1);
  assert.equal(day2, 1);
  assert.equal(day3, 0.95);
  assert.equal(day5, 0.95);
  assert.ok(day5 > day10);
  assert.ok(day10 > day30);
});

test("入站互动增强而出站互动减半", () => {
  assert.equal(INBOUND_DIRECTION_WEIGHT, 1.5);
  assert.equal(OUTBOUND_DIRECTION_WEIGHT, 0.5);
  const scores = scoreInteractions(
    [
      { tweetId: "in", author: "inbound", target: "self", type: "mention", source: "yahoo" },
      { tweetId: "out", author: "self", target: "outbound", type: "mention", source: "yahoo" },
    ],
    "self",
  );
  const inbound = scores.find((row) => row.screenName === "inbound");
  const outbound = scores.find((row) => row.screenName === "outbound");
  assert.ok(inbound && outbound);
  assert.ok(inbound.finalScore > outbound.finalScore);
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
  assert.equal(incoming[0]?.text, "hello @Self");
});

test("Yahoo 入站会从 URL 补全作者并识别回复", () => {
  const incoming = yahooEntriesToInteractionEvents(
    [
      {
        id: "yahoo-1",
        displayTextBody: "  <b>Hello</b>&nbsp;@Self  ",
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
      text: "Hello @Self",
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

test("圈图把最高加权分排入内圈，并显示加权分而非互动次数", () => {
  const result = yahooToAnalysisResult(
    { screenName: "self", displayName: "self" },
    [
      {
        id: "low",
        screenName: "low",
        displayName: "low",
        avatarUrl: "https://pbs.twimg.com/profile_images/low_400x400.jpg",
        avatarUrlPreview: "https://pbs.twimg.com/profile_images/low_normal.jpg",
        interactionScore: 35,
        interactionCount: 99,
      },
      {
        id: "high",
        screenName: "high",
        displayName: "high",
        avatarUrl: "https://pbs.twimg.com/profile_images/high_400x400.jpg",
        avatarUrlPreview: "https://pbs.twimg.com/profile_images/high_normal.jpg",
        interactionScore: 92,
        interactionCount: 12,
      },
    ],
    { toYou: 0, fromYou: 0 },
  );

  assert.equal(result.topUsers[0]?.user.userName, "high");
  assert.equal(result.topUsers[0]?.score, 92);
  assert.equal(result.topUsers[0]?.mentions, 12);
  assert.deepEqual(result.topUsers[0]?.user.profilePictureFallbacks, [
    "https://pbs.twimg.com/profile_images/high_normal.jpg",
    "/api/avatar?username=high",
  ]);
});

test("分享链接在本地预览时仍使用可公开访问的站点域名", () => {
  assert.equal(
    getShareUrl("/zh/circle/abc123", "http://localhost:3000"),
    "https://circle.catsuki.cc/zh/circle/abc123",
  );
  assert.equal(
    getShareUrl("/en/circle/abc123", "https://preview.example.com"),
    "https://preview.example.com/en/circle/abc123",
  );
});

test("stable IDs join a Yahoo historical handle to the FxTwitter handle before scoring", () => {
  const yahoo = yahooEntriesToInteractionEvents([
    { id: "in", userId: "42", screenName: "old_name", mentions: [{ id: "1", screenName: "self" }] },
  ], [
    { id: "out", userId: "1", mentions: [{ id: "42", screenName: "old_name" }] },
  ], "self");
  const fx = fxStatusesToInteractionEvents([{
    id: "out", author: { id: "1", screen_name: "self" },
    replying_to: { screen_name: "new_name" },
    raw_text: { facets: [{ type: "mention", original: "new_name", id: "42" }] },
  }], "self", "outbound");
  for (const groups of [[yahoo, fx], [fx, yahoo]]) {
    const merged = mergeInteractionEvents(groups);
    assert.equal(merged.length, 3);
    assert.equal(scoreInteractions(merged, "self").length, 1);
    const reply = merged.find((e) => e.tweetId === "out" && e.source === "fxtwitter")!;
    assert.equal(reply.type, "reply");
    assert.equal(reply.targetId, "42");
    assert.deepEqual(new Set(reply.sources), new Set(["fxtwitter"]));
    const scores = scoreInteractions(merged, "self");
    assert.equal(scores.length, 1);
    assert.equal(scores[0].screenName, "new_name");
    assert.equal(scores[0].interactionCount, 3);
  }
});

test("different account IDs and unverified names remain separate", () => {
  const rows: InteractionEvent[] = [
    { tweetId: "1", author: "old_name", authorId: "42", target: "self", type: "reply", source: "yahoo" },
    { tweetId: "2", author: "new_name", authorId: "99", target: "self", type: "reply", source: "fxtwitter" },
    { tweetId: "3", author: "unknown", target: "self", type: "reply", source: "yahoo" },
  ];
  assert.equal(scoreInteractions(mergeInteractionEvents([rows]), "self").length, 3);
});

test("a recycled handle with conflicting IDs is not used to infer identity", () => {
  const rows: InteractionEvent[] = [
    { tweetId: "1", author: "same", authorId: "42", target: "self", type: "reply", source: "yahoo" },
    { tweetId: "2", author: "same", authorId: "99", target: "self", type: "reply", source: "fxtwitter" },
    { tweetId: "3", author: "same", target: "self", type: "reply", source: "yahoo" },
  ];
  const merged = mergeInteractionEvents([rows]);
  assert.equal(merged[2].authorId, undefined);
  assert.equal(scoreInteractions(merged, "self").length, 3);
});

test("different accounts sharing one avatar are both retained", async () => {
  const rows: InteractionEvent[] = [
    { tweetId: "a", author: "alice", authorId: "42", target: "self", type: "mention", source: "yahoo" },
    { tweetId: "b", author: "bob", authorId: "99", target: "self", type: "mention", source: "fxtwitter" },
  ];
  const scores = scoreInteractions(mergeInteractionEvents([rows]), "self");
  const avatar = "https://pbs.twimg.com/profile_images/shared/avatar_400x400.jpg";
  const users = await interactionScoresToCircleUsers(scores, { alice: avatar, bob: avatar });
  assert.deepEqual(new Set(users.map((u) => u.screenName)), new Set(["alice", "bob"]));
});
