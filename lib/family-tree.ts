import type { CircleUser, FamilyRelationType } from "@/types/circle";

export type FamilyGroup = {
  relation: FamilyRelationType;
  users: CircleUser[];
};

/** 按互动排名生成娱乐性的“关系树”，不表示真实亲属关系。 */
export function buildFamilyGroups(users: CircleUser[]): FamilyGroup[] {
  const sorted = [...users].sort(
    (a, b) => b.interactionScore - a.interactionScore,
  );
  const groups: FamilyGroup[] = [
    { relation: "parent", users: sorted.slice(1, 3) },
    { relation: "partner", users: sorted.slice(0, 1) },
    { relation: "sibling", users: sorted.slice(3, 9) },
    { relation: "child", users: sorted.slice(9, 15) },
    { relation: "relative", users: sorted.slice(15, 23) },
  ];
  return groups.filter((group) => group.users.length > 0);
}
