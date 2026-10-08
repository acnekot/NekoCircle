import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  BraveApiError,
  buildBraveQuery,
  buildBraveUrl,
  fetchBraveMentionsSafe,
  fetchBraveMentionsToYou,
  parseBraveResults,
} from "../lib/brave-search";

/** 全部测试都注入假 fetch，不会请求真实的 Brave 接口。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeBrave(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (!next) throw new Error("unexpected extra request");
    return next;
  };
  return { calls, fetchImpl };
}

/** 一页只有一条推文的结果，标题里带上提及。 */
function onePost(id: string, screen: string) {
  return {
    web: {
      results: [{ url: `https://x.com/${screen}/status/${id}`, title: `${screen}: "@acnekot hi"` }],
    },
  };
}

test("查询串只包含 @用户名 与 site 限定，地址里不出现 key", () => {
  assert.equal(buildBraveQuery("@AcNeKoT"), '"@acnekot" (site:x.com OR site:twitter.com)');

  const url = new URL(buildBraveUrl("acnekot", { offset: 2 }));
  assert.equal(`${url.origin}${url.pathname}`, "https://api.search.brave.com/res/v1/web/search");
  assert.equal(url.searchParams.get("q"), buildBraveQuery("acnekot"));
  assert.equal(url.searchParams.get("count"), "20");
  assert.equal(url.searchParams.get("offset"), "2");
  assert.equal(url.searchParams.get("freshness"), "pw");
  assert.equal(url.searchParams.has("key"), false);
  assert.equal(url.searchParams.has("X-Subscription-Token"), false);
});

test("解析只采纳 X 站内的推文地址，且标题或摘要里要提到目标用户", () => {
  const entries = parseBraveResults(
    {
      web: {
        results: [
          { url: "https://x.com/Alice/status/1234567890", title: 'Alice on X: "@acnekot hi" / X' },
          { url: "https://mobile.twitter.com/bob/status/2345678901", title: 'Bob: "@acnekot yo"' },
          {
            url: "https://example.com/post",
            title: "@acnekot",
            description: "reply https://x.com/carol/statuses/3456789012",
          },
          {
            url: "https://example.com/redirect?to=https://x.com/erin/status/5678901234",
            title: '"@acnekot" via redirect',
          },
          { url: "https://x.com/dave/status/4567890123", title: 'Dave: "hello" / X' },
          { url: "https://x.com/alice/status/1234567890", title: 'dup "@acnekot"' },
          { url: "https://x.com/acnekot/status/9999999999", title: '"@acnekot" self' },
        ],
      },
    },
    "acnekot",
  );

  assert.deepEqual(
    entries.map((entry) => entry.tweetId),
    ["1234567890", "2345678901"],
  );
  assert.equal(entries[0]?.screenName, "alice");
  assert.equal(entries[0]?.url, "https://x.com/alice/status/1234567890");
});

test("没有用户名的 i/web/status 地址无法确定作者，会被忽略", () => {
  const entries = parseBraveResults(
    {
      web: {
        results: [
          { url: "https://x.com/i/web/status/6789012345", title: '"@acnekot" hello' },
          { url: "https://x.com/alice", title: '"@acnekot" profile page' },
        ],
      },
    },
    "acnekot",
  );

  assert.deepEqual(entries, []);
});

test("requireMention 为 false 时，标题和摘要里没有 @目标用户 的 X 推文也会采纳", () => {
  const response = {
    web: {
      results: [
        { url: "https://x.com/dave/status/4567890123", title: 'Dave: "hello" / X' },
        {
          url: "https://example.com/post",
          title: "@acnekot",
          description: "https://x.com/carol/status/3456789012",
        },
        { url: "https://x.com/acnekot/status/9999999999", title: "self" },
      ],
    },
  };

  assert.deepEqual(parseBraveResults(response, "acnekot"), []);
  assert.deepEqual(
    parseBraveResults(response, "acnekot", { requireMention: false }).map((entry) => entry.tweetId),
    ["4567890123"],
  );
});

test("requireMention 选项会传给分页抓取", async () => {
  const page = {
    web: { results: [{ url: "https://x.com/dave/status/4567890123", title: 'Dave: "hello" / X' }] },
  };

  const strict = fakeBrave([jsonResponse(page), jsonResponse(page)]);
  assert.deepEqual(
    await fetchBraveMentionsToYou("acnekot", {
      apiKey: "k",
      delayMs: 0,
      maxPages: 2,
      fetchImpl: strict.fetchImpl,
    }),
    [],
  );

  const relaxed = fakeBrave([jsonResponse(page), jsonResponse(page)]);
  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 2,
    requireMention: false,
    fetchImpl: relaxed.fetchImpl,
  });
  assert.deepEqual(entries.map((entry) => entry.tweetId), ["4567890123"]);
});

test("请求带上 X-Subscription-Token，连续两页没有新增时停止翻页", async () => {
  const page = onePost("1234567890", "alice");
  const { calls, fetchImpl } = fakeBrave([jsonResponse(page), jsonResponse(page), jsonResponse(page)]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "test-key",
    delayMs: 0,
    maxPages: 5,
    fetchImpl,
  });

  assert.equal(entries.length, 1);
  assert.equal(calls.length, 3, "第二、三页都没有新增，第四页不应该被请求");
  assert.equal(new Headers(calls[0]?.init?.headers).get("X-Subscription-Token"), "test-key");
  assert.equal(calls[0]?.url.includes("test-key"), false);
});

test("分页结果重叠时，允许一页没有新增，后面的新推文仍然会被收集", async () => {
  const { calls, fetchImpl } = fakeBrave([
    jsonResponse(onePost("1234567890", "alice")),
    jsonResponse(onePost("1234567890", "alice")),
    jsonResponse(onePost("2345678901", "bob")),
  ]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 3,
    fetchImpl,
  });

  assert.deepEqual(entries.map((entry) => entry.tweetId), ["1234567890", "2345678901"]);
  assert.equal(calls.length, 3);
});

test("响应表示没有更多结果时停止翻页", async () => {
  const { calls, fetchImpl } = fakeBrave([
    jsonResponse({ query: { more_results_available: false }, ...onePost("1234567890", "alice") }),
  ]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 5,
    fetchImpl,
  });

  assert.equal(entries.length, 1);
  assert.equal(calls.length, 1);
});

test("第一页没有结果时直接停止", async () => {
  const { calls, fetchImpl } = fakeBrave([jsonResponse({ web: { results: [] } })]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 5,
    fetchImpl,
  });

  assert.deepEqual(entries, []);
  assert.equal(calls.length, 1);
});

test("maxPages 限制请求页数", async () => {
  const { calls, fetchImpl } = fakeBrave([
    jsonResponse(onePost("10000", "a1")),
    jsonResponse(onePost("20000", "a2")),
    jsonResponse(onePost("30000", "a3")),
  ]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 2,
    fetchImpl,
  });

  assert.equal(entries.length, 2);
  assert.equal(calls.length, 2);
});

test("后续页面被限流（429）时保留已拿到的结果", async () => {
  const { calls, fetchImpl } = fakeBrave([
    jsonResponse(onePost("1234567890", "alice")),
    jsonResponse({ error: "rate limited" }, 429),
  ]);

  const entries = await fetchBraveMentionsToYou("acnekot", {
    apiKey: "k",
    delayMs: 0,
    maxPages: 3,
    fetchImpl,
  });

  assert.deepEqual(entries.map((entry) => entry.tweetId), ["1234567890"]);
  assert.equal(calls.length, 2);
});

test("首页鉴权失败时 fetchBraveMentionsToYou 抛出 BraveApiError，安全版本返回空数组", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const first = fakeBrave([jsonResponse({ error: "invalid key" }, 401)]);
    await assert.rejects(
      fetchBraveMentionsToYou("acnekot", { apiKey: "bad", delayMs: 0, fetchImpl: first.fetchImpl }),
      (error: unknown) => error instanceof BraveApiError && error.status === 401,
    );

    const second = fakeBrave([jsonResponse({ error: "invalid key" }, 401)]);
    const entries = await fetchBraveMentionsSafe("acnekot", {
      apiKey: "bad",
      delayMs: 0,
      fetchImpl: second.fetchImpl,
    });
    assert.deepEqual(entries, []);
    assert.equal(second.calls.length, 1);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});

test("没有 key 时不发任何请求", async () => {
  const { calls, fetchImpl } = fakeBrave([]);
  const entries = await fetchBraveMentionsSafe("acnekot", { apiKey: "", fetchImpl });
  assert.deepEqual(entries, []);
  assert.equal(calls.length, 0);
});

test("用户名含非法字符时直接返回空数组，不拼进查询", async () => {
  const { calls, fetchImpl } = fakeBrave([]);
  const entries = await fetchBraveMentionsToYou('bad" OR site:evil.example', {
    apiKey: "k",
    fetchImpl,
  });
  assert.deepEqual(entries, []);
  assert.equal(calls.length, 0);
});
