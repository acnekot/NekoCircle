import assert from "node:assert/strict";
import test from "node:test";
import { aggregateLikes, likeTimeWeight } from "../lib/affinity/likes";
import { buildFollowSignals } from "../lib/affinity/follows";
import { mergeAffinitySignals } from "../lib/affinity/merge";
import {
  combineConversationAndAffinity,
  continuityScore,
  scoreAffinity,
} from "../lib/affinity/scoring";
import type { LikeSignal } from "../lib/affinity/types";
import { clearXKitCachesForTests, getCachedFollows, getCachedLikes, setCachedFollows, setCachedLikes } from "../lib/xkit/cache";

const DAY = 86_400_000;

test("点赞使用 30 天半衰期", () => {
  const now = Date.UTC(2026, 8, 23);
  assert.equal(likeTimeWeight(now, now), 1);
  assert.ok(Math.abs(likeTimeWeight(now - 30 * DAY, now) - 0.5) < 1e-12);
  assert.ok(Math.abs(likeTimeWeight(now - 60 * DAY, now) - 0.25) < 1e-12);
});

test("聚合点赞按作者统计数量、加权数和活跃日期", () => {
  const now = Date.UTC(2026, 8, 23);
  const likes: LikeSignal[] = [
    { tweetId: "1", targetScreenName: "Alice", createdAt: now },
    { tweetId: "2", targetScreenName: "@ALICE", createdAt: now },
    { tweetId: "3", targetScreenName: "alice", createdAt: now - DAY },
    { tweetId: "4", targetScreenName: "Bob", createdAt: now - 30 * DAY },
  ];
  const peers = aggregateLikes(likes, now);
  const alice = peers.find((peer) => peer.screenName === "alice");
  const bob = peers.find((peer) => peer.screenName === "bob");
  assert.equal(alice?.likeCount, 3);
  assert.equal(alice?.likeActiveDays, 2);
  assert.ok(Math.abs((alice?.weightedLikeCount ?? 0) - 2.977159968434245) < 1e-8);
  assert.equal(bob?.likeActiveDays, 1);
});

test("关注集合识别互关且只关注单向信号不能单独通过候选门槛", () => {
  const following = [
    { userId: "1", screenName: "alice", iFollow: true, followsMe: false },
    { userId: "2", screenName: "bob", iFollow: true, followsMe: false },
  ];
  const followers = [
    { userId: "1", screenName: "ALICE", iFollow: false, followsMe: true },
    { userId: "3", screenName: "cat", iFollow: false, followsMe: true },
  ];
  const combined = buildFollowSignals(following, followers);
  assert.equal(combined.find((peer) => peer.screenName === "alice")?.mutualFollow, true);
  assert.equal(combined.find((peer) => peer.screenName === "bob")?.mutualFollow, false);
  assert.equal(combined.find((peer) => peer.screenName === "cat")?.mutualFollow, false);
  const candidates = mergeAffinitySignals([], combined);
  assert.deepEqual(candidates.map((peer) => peer.screenName), ["alice"]);
});

test("持续性压缩点赞亲和分，mutual follow 按设定加权", () => {
  assert.equal(continuityScore(0), 0);
  assert.equal(continuityScore(14), 1);
  const mutual = {
    screenName: "alice",
    likeCount: 0,
    weightedLikeCount: 0,
    likeActiveDays: 0,
    iFollow: true,
    followsMe: true,
    mutualFollow: true,
  };
  assert.equal(scoreAffinity(mutual), 0.6);
});

test("亲和分可以让被点赞作者进入圈子并与对话分按 72/28 归一融合", () => {
  const conversation = [{
    screenName: "chatty",
    inbound: 1,
    outbound: 0,
    inboundCount: 1,
    outboundCount: 0,
    interactionCount: 1,
    balance: 0,
    finalScore: 4,
    sources: ["yahoo" as const],
  }];
  const peers = [
    { screenName: "liked", likeCount: 58, weightedLikeCount: 50, likeActiveDays: 12, iFollow: false, followsMe: false, mutualFollow: false },
    { screenName: "oneway", likeCount: 0, weightedLikeCount: 0, likeActiveDays: 0, iFollow: true, followsMe: false, mutualFollow: false },
  ];
  const candidates = mergeAffinitySignals(peers, []);
  const result = combineConversationAndAffinity(conversation, candidates);
  assert.deepEqual(result.map((row) => row.screenName), ["chatty", "liked"]);
  assert.equal(result[1]?.interactionCount, 0);
  assert.equal(result[1]?.affinityScore, scoreAffinity(peers[0]!));
  assert.ok(result[1]!.finalScore > 0);
  assert.ok(!result.some((row) => row.screenName === "oneway"));
});

test("xKit 缓存只存聚合信号、按账号隔离并遵守扫描深度", () => {
  clearXKitCachesForTests();
  const peer = {
    screenName: "alice",
    likeCount: 12,
    weightedLikeCount: 9.5,
    likeActiveDays: 4,
    iFollow: false,
    followsMe: false,
    mutualFollow: false,
  };
  setCachedLikes("account-1", 300, [peer], 100);
  assert.equal(getCachedLikes("account-1", 300, 100)?.[0]?.likeCount, 12);
  assert.equal(getCachedLikes("account-2", 300, 100), undefined);
  assert.equal(getCachedLikes("account-1", 1000, 100), undefined);
  assert.equal(getCachedLikes("account-1", 300, 100 + 6 * 60 * 60 * 1000), undefined);

  const follows = { following: [], followers: [] };
  setCachedFollows("account-1", follows, 100);
  assert.deepEqual(getCachedFollows("account-1", 100), follows);
  assert.equal(getCachedFollows("account-2", 100), undefined);
  assert.equal(getCachedFollows("account-1", 100 + 24 * 60 * 60 * 1000), undefined);
  clearXKitCachesForTests();
});
