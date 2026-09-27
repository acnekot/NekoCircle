import type { InteractionEvent } from "@/types/interaction";
import { normalizeUsername } from "./normalize";

/** Prefer current structured profiles over search-index names, using stable IDs only. */
export function reconcileIdentities(events: readonly InteractionEvent[]): InteractionEvent[] {
  const names = new Map<string, { name: string; priority: number; observedAt: number }>();
  const idsByName = new Map<string, Set<string>>();
  for (const event of events) {
    for (const [rawName, id] of [[event.author, event.authorId], [event.target, event.targetId]]) {
      if (!rawName || !id) continue;
      const name = normalizeUsername(rawName);
      if (!name) continue;
      const ids = idsByName.get(name) ?? new Set<string>();
      ids.add(id);
      idsByName.set(name, ids);
      const priority = event.source === "fxtwitter" || event.sources?.includes("fxtwitter") ? 2 : 1;
      // 同一来源的名字冲突时，取最近事件中的名字；无时间或时间相同则
      // 固定按名字排序，避免请求完成顺序改变展示结果。
      const observedAt = Number.isFinite(event.createdAt) ? event.createdAt! : 0;
      const previous = names.get(id);
      if (!previous || priority > previous.priority ||
        (priority === previous.priority &&
          (observedAt > previous.observedAt ||
            (observedAt === previous.observedAt && name < previous.name)))) {
        names.set(id, { name, priority, observedAt });
      }
    }
  }
  const resolve = (raw: string, suppliedId?: string): { name: string; id?: string } => {
    const name = normalizeUsername(raw);
    const ids = idsByName.get(name);
    const id = suppliedId ?? (ids?.size === 1 ? [...ids][0] : undefined);
    return { name: (id && names.get(id)?.name) || name, id };
  };
  return events.map((event) => {
    const author = resolve(event.author, event.authorId);
    const target = resolve(event.target, event.targetId);
    return {
      ...event,
      author: author.name,
      target: target.name,
      ...(author.id ? { authorId: author.id } : {}),
      ...(target.id ? { targetId: target.id } : {}),
    };
  });
}
