import type { TwitterUser, Tweet, TweetMention, TweetRef } from "./twitter";

function fakeUser(i: number): TwitterUser {
  const names = ["alice","bob","carol","dave","eve","frank","grace","henry","iris","jack",
    "kate","liam","mia","noah","olivia","peter","quinn","rose","sam","tina"];
  const n = names[i % names.length];
  return {
    id: `mock_uid_${i}`,
    userName: `${n}_${i}`,
    name: n.charAt(0).toUpperCase() + n.slice(1) + ` ${i}`,
    profilePicture: `https://i.pravatar.cc/48?u=${n}${i}`,
    followers: Math.floor(Math.random() * 50000),
    isBlueVerified: i % 7 === 0,
    isProtected: false,
  };
}

function mentionOf(user: TwitterUser): TweetMention {
  return { id: user.id, userName: user.userName, name: user.name };
}

function refOf(user: TwitterUser, id: string): TweetRef {
  return { id, author: user };
}

export function mockGetUserInfo(username: string): TwitterUser {
  return {
    id: "mock_target_001",
    userName: username,
    name: `Mock ${username}`,
    profilePicture: `https://i.pravatar.cc/96?u=${username}`,
    followers: 12345,
    isBlueVerified: true,
    isProtected: false,
  };
}

export function mockGetUserTweets(limit: number): Tweet[] {
  const target = mockGetUserInfo("mockuser");
  return Array.from({ length: Math.min(limit, 20) }, (_, i) => {
    const mentionUser = fakeUser((i + 4) % 20);
    const replyTarget = fakeUser((i + 1) % 20);
    const quoteTarget = fakeUser((i + 2) % 20);
    const rtTarget = fakeUser((i + 3) % 20);
    return {
      id: `mock_tweet_${i}`,
      text: `This is mock tweet #${i}`,
      author: target,
      retweetCount: Math.floor(Math.random() * 10),
      replyCount: Math.floor(Math.random() * 8),
      quoteCount: Math.floor(Math.random() * 5),
      likeCount: Math.floor(Math.random() * 100),
      viewCount: Math.floor(Math.random() * 5000),
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      isReply: i % 4 === 0,
      inReplyToId: i % 4 === 0 ? `reply_to_${replyTarget.id}` : undefined,
      inReplyToUserId: i % 4 === 0 ? replyTarget.id : undefined,
      inReplyToUsername: i % 4 === 0 ? replyTarget.userName : undefined,
      conversationId: `conv_${i}`,
      userMentions: i % 3 === 0 ? [mentionOf(mentionUser)] : [],
      quotedTweet: i % 5 === 0 ? refOf(quoteTarget, `quoted_${i}`) : null,
      retweetedTweet: i % 6 === 0 ? refOf(rtTarget, `retweeted_${i}`) : null,
    };
  });
}

export function mockGetReplies(tweetId: string): Tweet[] {
  const count = Math.floor(Math.random() * 4);
  const seed = parseInt(tweetId.replace(/\D/g, "") || "0", 10);
  const target = mockGetUserInfo("mockuser");
  return Array.from({ length: count }, (_, i) => {
    const author = fakeUser((seed + i * 3) % 20);
    return {
      id: `mock_reply_${tweetId}_${i}`,
      text: `Reply ${i} to ${tweetId}`,
      author,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      likeCount: Math.floor(Math.random() * 20),
      viewCount: Math.floor(Math.random() * 500),
      createdAt: new Date(Date.now() - i * 600000).toISOString(),
      isReply: true,
      conversationId: tweetId,
      inReplyToId: tweetId,
      inReplyToUserId: target.id,
      inReplyToUsername: target.userName,
      userMentions: [mentionOf(target)],
      quotedTweet: null,
      retweetedTweet: null,
    };
  });
}

export function mockGetRetweets(tweetId: string): TwitterUser[] {
  const count = Math.floor(Math.random() * 3);
  const seed = parseInt(tweetId.replace(/\D/g, "") || "0", 10);
  return Array.from({ length: count }, (_, i) => fakeUser((seed + i * 5 + 2) % 20));
}

export function mockGetQuotes(tweetId: string): Tweet[] {
  const count = Math.floor(Math.random() * 2);
  const seed = parseInt(tweetId.replace(/\D/g, "") || "0", 10);
  return Array.from({ length: count }, (_, i) => ({
    id: `mock_quote_${tweetId}_${i}`,
    text: `Quote ${i} for ${tweetId}`,
    author: fakeUser((seed + i * 7 + 4) % 20),
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    likeCount: Math.floor(Math.random() * 20),
    viewCount: Math.floor(Math.random() * 500),
    createdAt: new Date(Date.now() - i * 600000).toISOString(),
    userMentions: [],
    quotedTweet: null,
    retweetedTweet: null,
  }));
}

export function mockGetMentions(): Tweet[] {
  const target = mockGetUserInfo("mockuser");
  return Array.from({ length: 8 }, (_, i) => ({
    id: `mock_mention_${i}`,
    text: `Hey @mockuser check this out! #${i}`,
    author: fakeUser(i * 2),
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    likeCount: 0,
    viewCount: 0,
    createdAt: new Date(Date.now() - i * 7200000).toISOString(),
    isReply: i % 2 === 0,
    inReplyToId: i % 2 === 0 ? `target_tweet_${i}` : undefined,
    inReplyToUserId: i % 2 === 0 ? target.id : undefined,
    inReplyToUsername: i % 2 === 0 ? target.userName : undefined,
    userMentions: [mentionOf(target)],
    quotedTweet: null,
    retweetedTweet: null,
  }));
}

export function mockGetThreadContext(tweetId: string): Tweet[] {
  return mockGetReplies(tweetId);
}
