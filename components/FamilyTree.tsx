"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import AvatarImage from "@/components/AvatarImage";
import { buildFamilyGroups } from "@/lib/family-tree";
import type { CircleUser, FamilyRelationType, SelfProfile } from "@/types/circle";

type Props = { self: SelfProfile; users: CircleUser[] };

const RELATION_KEYS: Record<FamilyRelationType, string> = {
  parent: "extras.family.parent",
  partner: "extras.family.partner",
  sibling: "extras.family.sibling",
  child: "extras.family.child",
  relative: "extras.family.relative",
};

function Avatar({ user }: { user: CircleUser }) {
  return (
    <a
      href={`https://x.com/${user.screenName}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-center gap-1.5 min-w-16"
      title={`@${user.screenName}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/15 bg-gray-800 group-hover:border-[#1d9bf0] transition-colors">
        <AvatarImage
          previewUrl={user.avatarUrlPreview}
          hdUrl={user.avatarUrl}
          name={user.screenName}
          imgClassName="w-full h-full object-cover"
          fallbackClassName="w-full h-full flex items-center justify-center font-bold text-gray-400"
        />
      </div>
      <span className="max-w-24 truncate text-[11px] text-gray-400 group-hover:text-[#1d9bf0]">
        @{user.screenName}
      </span>
    </a>
  );
}

export default function FamilyTree({ self, users }: Props) {
  const { t } = useTranslation();
  const groups = useMemo(() => buildFamilyGroups(users), [users]);

  return (
    <div className="card rounded-2xl p-5">
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold text-white">{t("extras.family.title")}</h2>
        <p className="text-xs text-gray-600 mt-1">{t("extras.family.disclaimer")}</p>
      </div>
      <div className="space-y-5">
        {groups.map((group, index) => (
          <div key={group.relation} className="relative">
            {index > 0 && <div className="mx-auto h-5 w-px bg-white/15 -mt-5" />}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-center text-xs font-medium text-gray-500 mb-3">
                {t(RELATION_KEYS[group.relation])}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {group.relation === "partner" && (
                  <div className="flex flex-col items-center gap-1.5 min-w-16">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#1d9bf0] bg-gray-800">
                      <AvatarImage
                        previewUrl={self.avatarUrlPreview}
                        hdUrl={self.avatarUrl}
                        name={self.screenName}
                        imgClassName="w-full h-full object-cover"
                        fallbackClassName="w-full h-full flex items-center justify-center font-bold text-white"
                      />
                    </div>
                    <span className="max-w-24 truncate text-[11px] text-[#1d9bf0]">@{self.screenName}</span>
                  </div>
                )}
                {group.users.map((user) => <Avatar key={user.id} user={user} />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
