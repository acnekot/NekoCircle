export type CircleUser = {
  id: string;
  screenName: string;
  displayName: string;
  /** Yahoo profileImage など。先に仮表示 */
  avatarUrlPreview?: string;
  /** fxtwitter / vxtwitter（高画質）。取れたら preview の上に描き直す */
  avatarUrl?: string;
  /** 0–100 想定。大きいほどアイコンがやや大きくなりやすい */
  interactionScore: number;
  /** 相手との馴れ合い回数（合算）。API から付くときはサイズ計算に使う */
  interactionCount?: number;
};

export type SelfProfile = {
  screenName: string;
  displayName: string;
  /** Yahoo 本人投稿の profileImage（仮） */
  avatarUrlPreview?: string;
  /** fxtwitter / vxtwitter（高画質） */
  avatarUrl?: string;
  /** あなたへの＋あなたからのメンション件数の合計（表示期間内） */
  mentionTotal?: number;
};

/** グリッド上の相手ユーザー1件（位置は canvas 側で行列から決定） */
export type CircleLayoutSlot = {
  user: CircleUser;
  /** interactionScore 由来のサイズ倍率 */
  avatarScaleFactor: number;
};
