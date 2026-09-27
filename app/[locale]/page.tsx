import IndependentMd3Demo from "./md3-demo/IndependentMd3Demo";
import type { Announcement } from "@/components/AnnouncementBanner";
import { getActiveAnnouncements, initDb } from "@/lib/db";

export const revalidate = 60;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let announcements: Announcement[] = [];

  try {
    initDb();
    announcements = getActiveAnnouncements(locale).map(
      ({ id, title, content, type, pinned, created_at }) => ({
        id,
        title,
        content,
        type,
        pinned,
        created_at,
      }),
    );
  } catch {
    // The client-side refresh remains as a fallback when the DB is unavailable
    // during a build or the first request after deployment.
  }

  return (
    <IndependentMd3Demo
      standaloneDemo={false}
      initialAnnouncements={announcements}
    />
  );
}
