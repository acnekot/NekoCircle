import assert from "node:assert/strict";
import test from "node:test";
import {
  XApiError,
  buildMentionsUrl,
  fetchXMentionsOfficial,
  resolveXUserId,
} from "../lib/x-official-mentions";

/** 全部测试都注入假 fetch，不会请求真实的 X 接口。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeX(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (!next) throw new Error("unexpected extra request");
    return next;
  };
  return { calls, fetchImpl };
}

/** 每次都返回一条新帖子和一个新的 next_token，用来测试硬上限。 */
function endlessX() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const n = calls.length;
    return jsonResponse(xPage([{ id: String(n), text: "t", author_id: "u1" }], [], `token-${n}`));
  };
  return { calls, fetchImpl };
}

function xPage(
  tweets: { id: string; text: string; author_id: string; created_at?: string }[],
  users: { id: string; username: string }[],
  nextToken?: string,
) {
  return {
    data: tweets,
    includes: { users },
    meta: { result_count: tweets.length, ...(nextToken ? { next_token: nextToken } : {}) },
  };
}

test("mentions 地址使用数字 ID，并带上展开字段、分页与 since 参数", () => {
  const url = new URL(buildMentionsUrl("123456", { paginationToken: "abc", sinceId: "999" }));
  assert.equal(url.pathname, "/2/users/123456/mentions");
  assert.equal(url.searchParams.get("max_results"), "100");
  assert.equal(url.searchParams.get("expansions"), "author_id");
  assert.equal(url.searchParams.get("tweet.fields"), "created_at,author_id");
  assert.equal(url.searchParams.get("user.fields"), "username");
  assert.equal(url.searchParams.get("pagination_token"), "abc");
  assert.equal(url.searchParams.get("since_id"), "999");

  assert.throws(() => buildMentionsUrl("acnekot"), /数字 ID/);
  assert.throws(() => buildMentionsUrl("123456", { sinceId: "abc" }), /数字 ID/);
});

test("max_results 被限制在 5 到 100 之间", () => {
  const limit = (maxResults: number) =>
    new URL(buildMentionsUrl("123456", { maxResults })).searchParams.get("max_results");
  assert.equal(limit(1), "5");
  assert.equal(limit(20), "20");
  assert.equal(limit(500), "100");
});

test("用户名解析为数字 ID，Bearer token 只出现在请求头里", async () => {
  const { calls, fetchImpl } = fakeX([jsonResponse({ data: { id: "123456", username: "acnekot" } })]);

  const id = await resolveXUserId("@AcNeKoT", { bearerToken: "secret-token", fetchImpl });

  assert.equal(id, "123456");
  assert.equal(calls[0]?.url, "https://api.x.com/2/users/by/username/acnekot");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bearer secret-token");
  assert.equal(calls[0]?.url.includes("secret-token"), false);
});

test("响应没有 data 时返回 undefined，非法用户名不发请求", async () => {
  const { calls, fetchImpl } = fakeX([jsonResponse({ errors: [{ title: "Not Found" }] })]);

  assert.equal(await resolveXUserId("acnekot", { bearerToken: "t", fetchImpl }), undefined);
  assert.equal(await resolveXUserId('x" OR 1', { bearerToken: "t", fetchImpl }), undefined);
  assert.equal(calls.length, 1);
});

test("多页拉取：跟随 next_token，用 includes 还原作者，并按 tweetId 去重", async () => {
  const { calls, fetchImpl } = fakeX([
    jsonResponse(
      xPage(
        [{ id: "101", text: "hi <b>@acnekot</b>", author_id: "u1", created_at: "2026-10-01T00:00:00.000Z" }],
        [{ id: "u1", username: "Alice" }],
        "page2",
      ),
    ),
    jsonResponse(
      xPage(
        [
          { id: "101", text: "hi again", author_id: "u1" },
          { id: "102", text: "yo", author_id: "u2" },
        ],
        [{ id: "u2", username: "Bob" }],
      ),
    ),
  ]);

  const entries = await fetchXMentionsOfficial("123456", { bearerToken: "t", fetchImpl });

  assert.deepEqual(
    entries.map((entry) => [entry.tweetId, entry.screenName]),
    [
      ["101", "alice"],
      ["102", "bob"],
    ],
  );
  assert.equal(entries[0]?.text, "hi @acnekot");
  assert.equal(entries[0]?.createdAt, "2026-10-01T00:00:00.000Z");
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]?.url ?? "").searchParams.get("pagination_token"), "page2");
});

test("maxPages 与 maxMentions 限制请求量", async () => {
  const page = (ids: string[], token?: string) =>
    jsonResponse(
      xPage(
        ids.map((id) => ({ id, text: id, author_id: "u1" })),
        [],
        token,
      ),
    );

  const paged = fakeX([page(["1", "2"], "t2"), page(["3", "4"], "t3")]);
  const pagedEntries = await fetchXMentionsOfficial("123456", {
    bearerToken: "t",
    fetchImpl: paged.fetchImpl,
    maxPages: 2,
  });
  assert.equal(pagedEntries.length, 4);
  assert.equal(paged.calls.length, 2, "maxPages 之后即使还有 next_token 也必须停止");

  const capped = fakeX([page(["5", "6", "7"], "t2")]);
  const cappedEntries = await fetchXMentionsOfficial("123456", {
    bearerToken: "t",
    fetchImpl: capped.fetchImpl,
    maxMentions: 2,
  });
  assert.deepEqual(cappedEntries.map((entry) => entry.tweetId), ["5", "6"]);
  assert.equal(capped.calls.length, 1, "达到条数上限后不再请求下一页");
  assert.equal(new URL(capped.calls[0]?.url ?? "").searchParams.get("max_results"), "5");
});

test("maxPages 即使传入更大的数字也不超过 8 页", async () => {
  const { calls, fetchImpl } = endlessX();
  const entries = await fetchXMentionsOfficial("123456", { bearerToken: "t", fetchImpl, maxPages: 100 });
  assert.equal(calls.length, 8);
  assert.equal(entries.length, 8);
});

test("next_token 重复时停止翻页，避免服务端循环导致持续计费", async () => {
  const { calls, fetchImpl } = fakeX([
    jsonResponse(xPage([{ id: "1", text: "a", author_id: "u1" }], [], "same")),
    jsonResponse(xPage([{ id: "2", text: "b", author_id: "u1" }], [], "same")),
    jsonResponse(xPage([{ id: "3", text: "c", author_id: "u1" }], [])),
  ]);

  const entries = await fetchXMentionsOfficial("123456", { bearerToken: "t", fetchImpl, maxPages: 8 });

  assert.deepEqual(entries.map((entry) => entry.tweetId), ["1", "2"]);
  assert.equal(calls.length, 2);
});

test("每页的 max_results 按剩余预算设置，预算按返回的帖子数扣减", async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), text: "x", author_id: "u1" }));
  const second = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 101), text: "y", author_id: "u1" }));
  const { calls, fetchImpl } = fakeX([
    jsonResponse(xPage(first, [], "t2")),
    jsonResponse(xPage(second, [])),
  ]);

  const entries = await fetchXMentionsOfficial("123456", { bearerToken: "t", fetchImpl, maxMentions: 120 });

  assert.equal(entries.length, 120);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]?.url ?? "").searchParams.get("max_results"), "100");
  assert.equal(new URL(calls[1]?.url ?? "").searchParams.get("max_results"), "20");
});

test("首页鉴权失败抛出 XApiError；中途限流时保留已拿到的结果", async () => {
  const denied = fakeX([jsonResponse({ title: "Unauthorized" }, 401)]);
  await assert.rejects(
    fetchXMentionsOfficial("123456", { bearerToken: "bad", fetchImpl: denied.fetchImpl }),
    (error: unknown) => error instanceof XApiError && error.status === 401,
  );

  const limited = fakeX([
    jsonResponse(xPage([{ id: "201", text: "a", author_id: "u1" }], [], "next")),
    jsonResponse({ title: "Too Many Requests" }, 429),
  ]);
  const entries = await fetchXMentionsOfficial("123456", {
    bearerToken: "t",
    fetchImpl: limited.fetchImpl,
    maxPages: 3,
  });
  assert.deepEqual(entries.map((entry) => entry.tweetId), ["201"]);
  assert.equal(limited.calls.length, 2);
});
