import type { CircleLayoutSlot, CircleUser } from "@/types/circle";

export function layoutUsers(users: CircleUser[]): CircleLayoutSlot[] {
  const sorted = [...users].sort((a, b) => {
    const ac = a.interactionCount ?? 0;
    const bc = b.interactionCount ?? 0;
    if (ac > 0 || bc > 0) {
      if (bc !== ac) return bc - ac;
    }
    return b.interactionScore - a.interactionScore;
  });
  return sorted.map((user) => ({
    user,
    avatarScaleFactor: 1,
  }));
}
