import type { ReactNode } from "react";

export type Md3IconName =
  | "palette" | "wallpaper" | "circle" | "visibility" | "group" | "badge"
  | "star" | "rank" | "restart" | "bubble" | "list" | "tree" | "sparkle"
  | "wallet" | "search" | "check" | "sad" | "error" | "message" | "quote"
  | "mention" | "repeat" | "north" | "south" | "share";

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
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {content}
    </svg>
  );
}
