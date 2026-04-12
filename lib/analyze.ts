import {
  getUserTweets, getTweetReplies, getTweetRetweets, getTweetQuotes,
  getUserMentions, getAdvancedSearch, setApiKeys, setMockMode, setManualSlowMode, isSlowMode,
  type TweetMention, type TwitterUser, type Tweet,
} from "./twitter";
import { getSetting } from "./db";
import type { ScoringWeights } from "./scoring";

export type InteractionUser = {
  user: TwitterUser;
  replies: number;
  quotes: number;
  retweets: number;
  mentions: number;
  outboundScore: number;
  inboundScore: number;
  score: number;
};

export type AnalysisResult = {
  targetUser: TwitterUser;
  topUsers: InteractionUser[];
  tweetCount: number;
  analyzedAt: string;
  weights: ScoringWeights;
};

export type LogEntry = {
  ts: number;
  tag: "info" | "tweet" | "reply" | "rt" | "quote" | "mention" | "score" | "warn" | "done";
  msg: string;
};

type SlimUser = Pick<TwitterUser, "id" | "userName" | "name">;

type RawInteractionSet = {
  replies: SlimUser[];
  retweets: SlimUser[];
  quotes: SlimUser[];
};

export type RawData = {
  tweets: { id: string; text: string; replyCount: number; retweetCount: number; quoteCount: number; createdAt: string }[];
  interactions: Record<string, RawInteractionSet>;
  mentions: SlimUser[];
  partial: boolean;
  stoppedAt?: number;
};

type Weights = ScoringWeights;

export type ProgressInfo = {
  msg: string;
  pct: number;
  etaSec: number;
  slowMode: boolean;
  entry: LogEntry;
  reqCount: number;
  spentCredits: number;
  savedCredits: number;
};

type ProgressCallback = (info: ProgressInfo) => void;

type InteractionAccumulator = {
  user: TwitterUser;
  replies: number;
  quotes: number;
  retweets: number;
  mentions: number;
  outboundScore: number;
  inboundScore: number;
};

function slim(user: TwitterUser): SlimUser {
  return { id: user.id, userName: user.userName, name: user.name };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function daysSince(createdAt?: string): number {
  if (!createdAt) return 0;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, (Date.now() - ts) / 86_400_000);
}

function decay(createdAt: string | undefined, lambda: number): number {
  return Math.exp(-lambda * daysSince(createdAt));
}

function buildSyntheticUser(partial: { id?: string; userName?: string; name?: string }): TwitterUser | null {
  if (!partial.id && !partial.userName) return null;
  const userName = partial.userName || partial.id || "unknown";
  return {
    id: partial.id || userName,
    userName,
    name: partial.name || userName,
    profilePicture: "",
    followers: 0,
    isBlueVerified: false,
    isProtected: false,
  };
}

function userFromMention(mention: TweetMention): TwitterUser | null {
  return buildSyntheticUser({ id: mention.id, userName: mention.userName, name: mention.name });
}


export async function analyzeUser(
  targetUser: TwitterUser,
  apiKey: string,
  tweetLimit: number,
  topCount: number,
  weights: Weights,
  onProgress?: ProgressCallback,
  extraKeys: string[] = [],
  useMock = false,
  checkStop?: () => boolean,
): Promise<{ result: AnalysisResult; rawData: RawData }> {
  setMockMode(useMock);
  setApiKeys([apiKey, ...extraKeys].filter(Boolean));

  if (!useMock) {
    const manualOn = getSetting("manual_slow_mode") === "1";
    const manualMs = parseInt(getSetting("manual_rate_ms") || "1000", 10);
    setManualSlowMode(manualOn, manualMs);
  }

  const ac = new AbortController();
  const signal = ac.signal;
  const stopPoller = checkStop ? setInterval(() => {
    if (checkStop()) {
      ac.abort();
      clearInterval(stopPoller!);
    }
  }, 300) : null;

  let reqCount = 0;
  let savedCredits = 0;
  let spentCredits = 0;
  let currentPct = 0;
  const startTime = Date.now();

  const emit = (tag: LogEntry["tag"], msg: string, pct: number, etaSec = -1) => {
    currentPct = pct;
    const entry: LogEntry = { ts: Date.now(), tag, msg };
    onProgress?.({ msg, pct, etaSec, slowMode: isSlowMode(), entry, reqCount, spentCredits, savedCredits });
  };

  const rawData: RawData = { tweets: [], interactions: {}, mentions: [], partial: false };
  let tweets: Tweet[] = [];

  try {
    emit("info", "📋 获取推文列表...", 2);
    tweets = await getUserTweets(targetUser.userName, apiKey, tweetLimit, signal);
    reqCount++;
    spentCredits += 15;

    if (tweets.length === 0) {
      if (targetUser.isProtected) emit("warn", `🔒 @${targetUser.userName} 是锁推账号（受保护），无法获取推文，无法生成互动圈`, 5);
      else emit("warn", `⚠️  @${targetUser.userName} 返回 0 条推文，疑似被 Shadowban（影子封禁），无法生成互动圈`, 5);
    } else {
      emit("info", `✅ 获取到 ${tweets.length} 条推文`, 5);
    }

    tweets.forEach((tweet, i) => {
      const url = `https://twitter.com/${targetUser.userName}/status/${tweet.id}`;
      const date = tweet.createdAt ? new Date(tweet.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "";
      const stats = [
        tweet.likeCount ? `❤️ ${fmt(tweet.likeCount)}` : "",
        tweet.viewCount ? `👁 ${fmt(tweet.viewCount)}` : "",
        `💬 ${tweet.replyCount}`,
        `🔁 ${tweet.retweetCount}`,
        `🗨️ ${tweet.quoteCount}`,
      ].filter(Boolean).join("  ");
      emit("tweet", `[${i + 1}/${tweets.length}] ${url}\n  📅 ${date}  ${stats}\n  "${tweet.text.replace(/\n+/g, " ")}"`, 5);
    });

    rawData.tweets = tweets.map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      replyCount: tweet.replyCount,
      retweetCount: tweet.retweetCount,
      quoteCount: tweet.quoteCount,
      createdAt: tweet.createdAt,
    }));

    const interactionMap = new Map<string, InteractionAccumulator>();
    const ensureUser = (user: TwitterUser): InteractionAccumulator => {
      const existing = interactionMap.get(user.id);
      if (existing) return existing;
      const created: InteractionAccumulator = {
        user,
        replies: 0,
        quotes: 0,
        retweets: 0,
        mentions: 0,
        outboundScore: 0,
        inboundScore: 0,
      };
      interactionMap.set(user.id, created);
      return created;
    };

    const addInteraction = (
      user: TwitterUser | null,
      kind: "replies" | "quotes" | "retweets" | "mentions",
      baseWeight: number,
      createdAt: string | undefined,
      direction: "outbound" | "inbound",
    ) => {
      if (!user?.userName && !user?.id) return;
      if (user.id === targetUser.id || user.userName === targetUser.userName) return;
      const bucket = ensureUser(user);
      bucket[kind] += 1;
      const value = baseWeight * decay(createdAt, weights.decayLambda);
      if (direction === "outbound") bucket.outboundScore += value;
      else bucket.inboundScore += value;
    };

    emit("info", "🧭 解析目标用户主动互动...", 10);
    const seenOutboundTweetIds = new Set<string>();
    for (const tweet of tweets) {
      seenOutboundTweetIds.add(tweet.id);
      const excluded = new Set<string>();
      const excludeUser = (user: TwitterUser | null) => {
        if (!user) return;
        if (user.id) excluded.add(`id:${user.id}`);
        if (user.userName) excluded.add(`un:${user.userName.toLowerCase()}`);
      };

      if (tweet.isReply && tweet.inReplyToUserId && tweet.inReplyToUserId !== targetUser.id) {
        const replyTarget = buildSyntheticUser({
          id: tweet.inReplyToUserId,
          userName: tweet.inReplyToUsername,
          name: tweet.inReplyToUsername,
        });
        addInteraction(replyTarget, "replies", weights.replyByMe, tweet.createdAt, "outbound");
        excludeUser(replyTarget);
      }

      if (tweet.quotedTweet?.author && tweet.quotedTweet.author.id !== targetUser.id) {
        addInteraction(tweet.quotedTweet.author, "quotes", weights.quoteByMe, tweet.createdAt, "outbound");
        excludeUser(tweet.quotedTweet.author);
      }

      if (tweet.retweetedTweet?.author && tweet.retweetedTweet.author.id !== targetUser.id) {
        addInteraction(tweet.retweetedTweet.author, "retweets", weights.rtByMe, tweet.createdAt, "outbound");
        excludeUser(tweet.retweetedTweet.author);
      }

      const seenMentions = new Set<string>();
      for (const mention of tweet.userMentions) {
        const user = userFromMention(mention);
        if (!user) continue;
        const key = user.id ? `id:${user.id}` : `un:${user.userName.toLowerCase()}`;
        const altKey = `un:${user.userName.toLowerCase()}`;
        if (excluded.has(key) || excluded.has(altKey) || seenMentions.has(key) || user.userName === targetUser.userName) continue;
        seenMentions.add(key);
        addInteraction(user, "mentions", weights.mentionByMe, tweet.createdAt, "outbound");
      }
    }

    // Advanced Search 补充：从 from:username filter:replies 中挖掘更深的历史回复记录
    // 这能覆盖 getUserTweets 限额之外的历史互动
    if (!signal.aborted) {
      emit("info", "🔎 Advanced Search：补充历史主动回复...", 11);
      try {
        const searchLimit = Math.max(tweetLimit * 2, 100);
        const replyTweets = await getAdvancedSearch(
          `from:${targetUser.userName} filter:replies`,
          apiKey,
          searchLimit,
          signal,
        );
        reqCount++;
        spentCredits += Math.ceil(replyTweets.length / 1000 * 150) || 1;
        let newCount = 0;
        for (const tweet of replyTweets) {
          if (seenOutboundTweetIds.has(tweet.id)) continue;
          seenOutboundTweetIds.add(tweet.id);
          if (tweet.inReplyToUserId && tweet.inReplyToUserId !== targetUser.id) {
            const replyTarget = buildSyntheticUser({
              id: tweet.inReplyToUserId,
              userName: tweet.inReplyToUsername,
              name: tweet.inReplyToUsername,
            });
            addInteraction(replyTarget, "replies", weights.replyByMe, tweet.createdAt, "outbound");
            newCount++;
          }
        }
        emit("info", `  ↳ 搜到 ${replyTweets.length} 条历史回复，${newCount} 条为新增`, 12);
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        emit("warn", "⚠️ Advanced Search 失败，跳过历史回复补充", 12);
      }
    }

    const activeTweets = tweets
      .filter((tweet) => tweet.replyCount > 0 || tweet.retweetCount > 0 || tweet.quoteCount > 0)
      .sort((a, b) => (b.replyCount + b.retweetCount + b.quoteCount) - (a.replyCount + a.retweetCount + a.quoteCount));
    emit("info", `🔍 ${activeTweets.length} 条有直接互动（按互动量排序），${tweets.length - activeTweets.length} 条零互动跳过`, 14);

    const estReqs = activeTweets.reduce((sum, tweet) => sum + (tweet.replyCount > 0 ? 1 : 0) + (tweet.retweetCount > 0 ? 1 : 0) + (tweet.quoteCount > 0 ? 1 : 0), 0) + 1;
    const seenInboundTweets = new Set<string>();

    for (let i = 0; i < activeTweets.length; i++) {
      if (signal.aborted) break;
      const tweet = activeTweets[i];
      const pct = 14 + Math.floor((i / Math.max(activeTweets.length, 1)) * 72);
      const elapsed = (Date.now() - startTime) / 1000;
      const secPerReq = reqCount > 1 ? elapsed / reqCount : (isSlowMode() ? 5.5 : 0.8);
      const etaSec = Math.round((estReqs - reqCount) * secPerReq);
      emit("tweet", `── [${i + 1}/${activeTweets.length}] https://twitter.com/${targetUser.userName}/status/${tweet.id}  💬${tweet.replyCount} 🔁${tweet.retweetCount} 🗨️${tweet.quoteCount}`, pct, etaSec);

      rawData.interactions[tweet.id] = { replies: [], retweets: [], quotes: [] };

      if (!isSlowMode()) {
        const tasks: Promise<void>[] = [];
        if (tweet.replyCount > 0) tasks.push((async () => {
          const replies = await getTweetReplies(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          replies.forEach((reply) => {
            if (!reply.author || reply.author.id === targetUser.id) return;
            addInteraction(reply.author, "replies", weights.repliedByHim, reply.createdAt || tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].replies.push(slim(reply.author));
            seenInboundTweets.add(reply.id);
            emit("reply", `  ↳ reply   @${reply.author.userName} (${reply.author.name})`, pct);
          });
          if (replies.length === 0) emit("info", "  ↳ reply   (0 结果)", pct);
        })());
        if (tweet.retweetCount > 0) tasks.push((async () => {
          const retweets = await getTweetRetweets(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          retweets.forEach((user) => {
            if (!user || user.id === targetUser.id) return;
            addInteraction(user, "retweets", weights.rtedByHim, tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].retweets.push(slim(user));
            emit("rt", `  ↳ retweet @${user.userName} (${user.name})`, pct);
          });
          if (retweets.length === 0) emit("info", "  ↳ retweet (0 结果)", pct);
        })());
        if (tweet.quoteCount > 0) tasks.push((async () => {
          const quotes = await getTweetQuotes(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          quotes.forEach((quote) => {
            if (!quote.author || quote.author.id === targetUser.id) return;
            addInteraction(quote.author, "quotes", weights.quotedByHim, quote.createdAt || tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].quotes.push(slim(quote.author));
            seenInboundTweets.add(quote.id);
            emit("quote", `  ↳ quote   @${quote.author.userName} (${quote.author.name})`, pct);
          });
          if (quotes.length === 0) emit("info", "  ↳ quote   (0 结果)", pct);
        })());
        await Promise.all(tasks);
      } else {
        if (tweet.replyCount > 0) {
          const replies = await getTweetReplies(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          replies.forEach((reply) => {
            if (!reply.author || reply.author.id === targetUser.id) return;
            addInteraction(reply.author, "replies", weights.repliedByHim, reply.createdAt || tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].replies.push(slim(reply.author));
            seenInboundTweets.add(reply.id);
            emit("reply", `  ↳ reply   @${reply.author.userName} (${reply.author.name})`, pct);
          });
        }
        if (tweet.retweetCount > 0) {
          const retweets = await getTweetRetweets(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          retweets.forEach((user) => {
            if (!user || user.id === targetUser.id) return;
            addInteraction(user, "retweets", weights.rtedByHim, tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].retweets.push(slim(user));
            emit("rt", `  ↳ retweet @${user.userName} (${user.name})`, pct);
          });
        }
        if (tweet.quoteCount > 0) {
          const quotes = await getTweetQuotes(tweet.id, apiKey, signal);
          reqCount++;
          spentCredits += 15;
          quotes.forEach((quote) => {
            if (!quote.author || quote.author.id === targetUser.id) return;
            addInteraction(quote.author, "quotes", weights.quotedByHim, quote.createdAt || tweet.createdAt, "inbound");
            rawData.interactions[tweet.id].quotes.push(slim(quote.author));
            seenInboundTweets.add(quote.id);
            emit("quote", `  ↳ quote   @${quote.author.userName} (${quote.author.name})`, pct);
          });
        }
      }
    }

    if (!signal.aborted) {
      emit("mention", "📣 获取 Mention 数据（分页）...", 90);
      const mentionLimit = Math.max(tweetLimit * 3, 200);
      const mentions = await getUserMentions(targetUser.id, apiKey, mentionLimit, signal);
      reqCount++;
      spentCredits += 15;
      for (const tweet of mentions) {
        if (!tweet.author || tweet.author.id === targetUser.id) continue;
        rawData.mentions.push(slim(tweet.author));
        if (seenInboundTweets.has(tweet.id)) continue;
        if (tweet.isReply || tweet.inReplyToUserId === targetUser.id) {
          addInteraction(tweet.author, "replies", weights.repliedByHim, tweet.createdAt, "inbound");
          emit("mention", `  ↳ inbound-reply @${tweet.author.userName} (${tweet.author.name})`, 92);
        } else {
          addInteraction(tweet.author, "mentions", weights.mentionedByHim, tweet.createdAt, "inbound");
          emit("mention", `  ↳ mention @${tweet.author.userName} (${tweet.author.name})`, 92);
        }
        seenInboundTweets.add(tweet.id);
      }
      emit("mention", `✅ ${mentions.length} 条 Mention`, 93);
    }

    emit("info", `⚖️  计算亲密度（${interactionMap.size} 位互动用户）...`, 96);
    const topUsers: InteractionUser[] = Array.from(interactionMap.values())
      .map((item) => ({
        ...item,
        score: item.outboundScore + item.inboundScore,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topCount);

    topUsers.slice(0, 10).forEach((user, i) => {
      emit("score", `  #${i + 1} @${user.user.userName} (${user.user.name})  reply:${user.replies} quote:${user.quotes} rt:${user.retweets} mention:${user.mentions} out:${user.outboundScore.toFixed(2)} in:${user.inboundScore.toFixed(2)} → score:${user.score.toFixed(2)}`, 97);
    });

    const totalSec = Math.round((Date.now() - startTime) / 1000);
    emit("done", `🎉 完成！API ${reqCount} 次，耗时 ${totalSec}s`, 100, 0);

    return {
      result: { targetUser, topUsers, tweetCount: tweets.length, analyzedAt: new Date().toISOString(), weights },
      rawData,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError" || signal.aborted) {
      rawData.partial = true;
      rawData.stoppedAt = Date.now();
      emit("warn", `⏹ API 调用已立即中断（${reqCount} 次调用已完成）`, currentPct, 0);
      return {
        result: { targetUser, topUsers: [], tweetCount: tweets.length, analyzedAt: new Date().toISOString(), weights },
        rawData,
      };
    }
    throw e;
  } finally {
    if (stopPoller) clearInterval(stopPoller);
  }
}
