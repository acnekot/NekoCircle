import type { ReactNode } from "react";

export type Md3IconName =
  | "palette" | "wallpaper" | "circle" | "visibility" | "group" | "badge"
  | "star" | "rank" | "restart" | "bubble" | "list" | "tree" | "sparkle"
  | "wallet" | "search" | "check" | "sad" | "error" | "message" | "quote"
  | "mention" | "repeat" | "north" | "south" | "share"
  | "info" | "warning" | "pin" | "close" | "pet" | "key" | "lock"
  | "edit" | "visibilityOff" | "delete" | "language" | "inbox"
  | "campaign" | "chart" | "globe" | "trend" | "person" | "send"
  | "feedback" | "open";

export default function Md3Icon({ name, className = "h-5 w-5" }: { name: Md3IconName; className?: string }) {
  let content: ReactNode;
  switch (name) {
    case "palette": content = <><path d="M12 3a9 9 0 0 0 0 18h1.2a2.2 2.2 0 0 0 0-4.4h-1a1.7 1.7 0 0 1 0-3.4H15A6 6 0 0 0 15 3h-3Z" /><path d="M7.5 9.3h.01M9.5 6.5h.01M13 5.7h.01M16.2 7.5h.01" /></> ; break;
    case "wallpaper": content = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 17 4.5-4.5 3.2 3.2 2.3-2.3 6 6M15.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /></>; break;
    case "circle": content = <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>; break;
    case "visibility": content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break;
    case "group": content = <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 16.2a4.3 4.3 0 0 1 6 2.8" /></>; break;
    case "badge": content = <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M7 16c.7-1.4 1.7-2 3-2s2.3.6 3 2M14 9h3M14 12h3" /></>; break;
    case "star": content = <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />; break;
    case "rank": content = <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 5h.01M4 11h.01M4 17h.01" /></>; break;
    case "restart": content = <><path d="M4 8V4m0 0h4M4 4l3.1 3.1A8 8 0 1 1 5 15" /></>; break;
    case "bubble": content = <><circle cx="12" cy="12" r="4" /><circle cx="6" cy="8" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>; break;
    case "list": content = <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>; break;
    case "tree": content = <><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3" y="17" width="6" height="4" rx="1" /><rect x="15" y="17" width="6" height="4" rx="1" /><path d="M12 7v5M6 17v-3h12v3" /></>; break;
    case "sparkle": content = <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z" /><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /></>; break;
    case "wallet": content = <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M14 9h7v6h-7a3 3 0 0 1 0-6Z" /><path d="M17 12h.01" /></>; break;
    case "search": content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break;
    case "check": content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 8" /></>; break;
    case "sad": content = <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 16c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2" /></>; break;
    case "error": content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>; break;
    case "message": content = <path d="M4 5h16v12H9l-5 4V5Z" />; break;
    case "quote": content = <><path d="M5 7h6v6H7a4 4 0 0 1-4 4M15 7h6v6h-4a4 4 0 0 1-4 4" /></>; break;
    case "mention": content = <><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.2 6.9" /></>; break;
    case "repeat": content = <><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" /></>; break;
    case "north": content = <path d="M12 20V4m0 0-5 5m5-5 5 5" />; break;
    case "south": content = <path d="M12 4v16m0 0-5-5m5 5 5-5" />; break;
    case "share": content = <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>; break;
    case "info": content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>; break;
    case "warning": content = <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>; break;
    case "pin": content = <><path d="m8 4 8 0-1 5 3 3v2H6v-2l3-3-1-5Z" /><path d="M12 14v7" /></>; break;
    case "close": content = <path d="m6 6 12 12M18 6 6 18" />; break;
    case "pet": content = <><path d="M7 10 5 5l5 3h4l5-3-2 5a7 7 0 1 1-10 0Z" /><path d="M9.5 13h.01M14.5 13h.01M10 16h4" /></>; break;
    case "key": content = <><circle cx="8" cy="12" r="4" /><path d="m12 12 9-9M17 7l2 2M15 9l2 2" /></>; break;
    case "lock": content = <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>; break;
    case "edit": content = <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>; break;
    case "visibilityOff": content = <><path d="M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.9M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6" /><path d="M9.8 9.8a3 3 0 0 0 4.4 4.4" /></>; break;
    case "delete": content = <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></>; break;
    case "language": content = <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>; break;
    case "inbox": content = <><path d="M4 5h16v14H4V5Z" /><path d="M4 14h5l1.5 2h3L15 14h5" /></>; break;
    case "campaign": content = <><path d="m4 13 11-4v8L4 13Z" /><path d="M4 13v5h4v-4M18 10v6M20 8v10" /></>; break;
    case "chart": content = <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>; break;
    case "globe": content = <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" /></>; break;
    case "trend": content = <><path d="m3 17 6-6 4 4 7-8" /><path d="M15 7h5v5" /></>; break;
    case "person": content = <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>; break;
    case "send": content = <><path d="m3 11 18-8-7 18-3-7-8-3Z" /><path d="m11 14 4-4" /></>; break;
    case "feedback": content = <><path d="M4 5h16v12H9l-5 4V5Z" /><path d="M8 9h8M8 13h5" /></>; break;
    case "open": content = <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>; break;
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {content}
    </svg>
  );
}
