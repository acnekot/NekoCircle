import type { CircleUser } from "@/types/circle";

export type DiagnosisType =
  | "retire"
  | "compatibility"
  | "crush"
  | "stalker";

type SupportedLocale = "zh" | "ja" | "en";

export const DIAGNOSIS_DEFS: Array<{
  id: DiagnosisType;
  needsPartner: boolean;
  title: Record<SupportedLocale, string>;
  description: Record<SupportedLocale, string>;
}> = [
  {
    id: "retire",
    needsPartner: false,
    title: { zh: "退网时间预测", ja: "引退時期推測", en: "Retirement prediction" },
    description: {
      zh: "根据近期互动模式推测账号何时可能暂别社交平台。",
      ja: "最近の交流傾向から引退時期を推測します。",
      en: "Estimate when the account may take a break from its recent activity.",
    },
  },
  {
    id: "compatibility",
    needsPartner: true,
    title: { zh: "互动默契诊断", ja: "相性診断", en: "Compatibility test" },
    description: {
      zh: "结合 Mention 频率，分析你与指定用户的互动默契。",
      ja: "メンション頻度から指定ユーザーとの相性を分析します。",
      en: "Analyze compatibility with a chosen user from mention frequency.",
    },
  },
  {
    id: "crush",
    needsPartner: false,
    title: { zh: "隐藏好感推测", ja: "秘密の片思い推測", en: "Secret crush guess" },
    description: {
      zh: "从互动频率偏差中生成一份娱乐性推测。",
      ja: "交流頻度の偏りから遊び心のある推測を生成します。",
      en: "Generate a playful guess from interaction-frequency patterns.",
    },
  },
  {
    id: "stalker",
    needsPartner: false,
    title: { zh: "默默关注者推测", ja: "こっそり見てる人推測", en: "Secret viewer guess" },
    description: {
      zh: "根据现有公开互动数据，推测可能持续关注你的人。",
      ja: "公開交流データから、継続的に見ている人を推測します。",
      en: "Guess who may follow your activity from the public interaction data.",
    },
  },
];

export function generateDiagnosisPrompt(
  type: DiagnosisType,
  locale: SupportedLocale,
  screenName: string,
  users: CircleUser[],
  partner?: string,
): string {
  const def = DIAGNOSIS_DEFS.find((item) => item.id === type);
  if (!def) return "";
  const ranking = users
    .slice(0, 20)
    .map(
      (user, index) =>
        `${index + 1}. @${user.screenName} — mentions: ${user.interactionCount ?? "?"}, score: ${user.interactionScore}`,
    )
    .join("\n");
  const partnerLine = partner ? `\nPartner: @${partner.replace(/^@+/, "")}\n` : "";

  if (locale === "en") {
    return `You are a playful social-interaction analyst. Analyze the public 30-day X mention data below for @${screenName}.\n\nTask: ${def.title.en}\n${def.description.en}${partnerLine}\nRanking:\n${ranking || "No interaction data."}\n\nReturn: a short title, a score or grade, 3–5 evidence-based observations, and one friendly suggestion. Clearly state that this is entertainment and an inference from incomplete public data.`;
  }
  if (locale === "ja") {
    return `あなたは遊び心のあるSNS交流分析官です。@${screenName} の過去30日間の公開Xメンションデータを分析してください。\n\nテーマ：${def.title.ja}\n${def.description.ja}${partnerLine}\nランキング：\n${ranking || "交流データなし"}\n\n短いタイトル、点数または評価、根拠のある観察を3〜5点、親しみやすい助言を出してください。不完全な公開データに基づく娯楽目的の推測であることを明記してください。`;
  }
  return `你是一名有趣但谨慎的社交互动分析师。请分析 @${screenName} 过去30天的公开 X Mention 数据。\n\n主题：${def.title.zh}\n${def.description.zh}${partnerLine}\n互动排名：\n${ranking || "暂无互动数据"}\n\n请给出：简短标题、分数或等级、3～5条有数据依据的观察，以及一条友好建议。请明确说明这只是基于不完整公开数据的娱乐性推测。`;
}
