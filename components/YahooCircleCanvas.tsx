"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { layoutUsers } from "@/lib/layout-circle";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = {
  self: SelfProfile;
  usersWithIcons: CircleUser[];
};

async function loadImageFirstAvailable(
  blobByOriginal: Map<string, string> | undefined,
  ...urls: (string | undefined)[]
): Promise<HTMLImageElement | null> {
  for (const raw of urls) {
    const u = raw?.trim();
    if (!u) continue;
    try {
      return await loadImage(u, blobByOriginal);
    } catch {
      /* 次の URL */
    }
  }
  return null;
}

async function loadImage(
  originalUrl: string,
  blobByOriginal?: Map<string, string>,
): Promise<HTMLImageElement> {
  const key = originalUrl.trim();
  const blobUrl = blobByOriginal?.get(key);
  if (blobUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("load"));
      img.src = blobUrl;
    });
  }

  const proxied = proxiedImageSrc(originalUrl);
  const attempts =
    proxied !== originalUrl ? [proxied] : [originalUrl];
  let last: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const src = attempts[i]!;
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        if (/^https?:\/\//.test(src)) {
          img.crossOrigin = "anonymous";
          try {
            if (new URL(src).origin !== window.location.origin) {
              img.referrerPolicy = "no-referrer";
            }
          } catch {
            /* ignore */
          }
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("load"));
        img.src = src;
      });
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("load");
}

function drawImageCoverInSquare(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  halfSide: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw < 1 || ih < 1) return;
  const side = halfSide * 2;
  const scale = Math.max(side / iw, side / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - halfSide, cy - halfSide, side, side);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function cellCenter(
  index: number,
  cols: number,
  W: number,
  rows: number,
): { cx: number; cy: number; cellW: number; cellH: number } {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = W / cols;
  const cellH = W / rows;
  return {
    cx: (col + 0.5) * cellW,
    cy: (row + 0.5) * cellH,
    cellW,
    cellH,
  };
}

function peerSquareOverlapsSelf(
  cx: number,
  cy: number,
  halfPeer: number,
  W: number,
  halfSelf: number,
): boolean {
  const s = (halfSelf + halfPeer) * 0.96;
  return (
    Math.abs(cx - W / 2) < s &&
    Math.abs(cy - W / 2) < s
  );
}

type PeerCell = { cx: number; cy: number; cellW: number; cellH: number };

function peerHalfUniform(cellW: number, cellH: number): number {
  return (Math.min(cellW, cellH) / 2) * 1;
}

function peerHalfDraw(cellW: number, cellH: number): number {
  return peerHalfUniform(cellW, cellH) * 0.97;
}

type GridPickMode = "pack" | "maxCell";

function pickPeerCellsForGrid(
  nPeers: number,
  W: number,
  halfSelf: number,
  minCellFrac: number | null,
  mode: GridPickMode,
): PeerCell[] | null {
  let best: PeerCell[] | null = null;
  let bestMinSide = -1;
  let bestMinSidePack = Infinity;
  let bestMeanDist = Infinity;
  let bestMaxDist = Infinity;

  for (let cols = 2; cols <= 18; cols++) {
    for (let rows = 2; rows <= 18; rows++) {
      if (cols * rows < nPeers) continue;
      const cellW = W / cols;
      const cellH = W / rows;
      const minSide = Math.min(cellW, cellH);
      if (minCellFrac !== null && minSide < W * minCellFrac) continue;

      const hp = peerHalfUniform(cellW, cellH);

      const candidates: { cell: PeerCell; d: number }[] = [];
      for (let idx = 0; idx < cols * rows; idx++) {
        const c = cellCenter(idx, cols, W, rows);
        if (peerSquareOverlapsSelf(c.cx, c.cy, hp, W, halfSelf)) continue;
        const d = Math.hypot(c.cx - W / 2, c.cy - W / 2);
        candidates.push({ cell: c, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      if (candidates.length < nPeers) continue;

      const picked = candidates.slice(0, nPeers);
      const meanDist =
        picked.reduce((s, x) => s + x.d, 0) / Math.max(1, picked.length);
      const maxDist = Math.max(...picked.map((x) => x.d));

      if (mode === "maxCell") {
        if (minSide > bestMinSide) {
          bestMinSide = minSide;
          best = picked.map((x) => x.cell);
        }
      } else {
        const tieEps = W * 0.0004;
        const betterPack =
          meanDist < bestMeanDist - tieEps ||
          (Math.abs(meanDist - bestMeanDist) <= tieEps &&
            maxDist < bestMaxDist - tieEps) ||
          (Math.abs(meanDist - bestMeanDist) <= tieEps &&
            Math.abs(maxDist - bestMaxDist) <= tieEps &&
            minSide < bestMinSidePack);
        if (betterPack) {
          bestMeanDist = meanDist;
          bestMaxDist = maxDist;
          bestMinSidePack = minSide;
          best = picked.map((x) => x.cell);
        }
      }
    }
  }

  return best;
}

function bestPeerCellsAvoidingCenter(
  nPeers: number,
  W: number,
  halfSelf: number,
): PeerCell[] {
  if (nPeers <= 0) return [];

  const packed =
    pickPeerCellsForGrid(nPeers, W, halfSelf, 0.09, "pack") ??
    pickPeerCellsForGrid(nPeers, W, halfSelf, 0.07, "pack") ??
    pickPeerCellsForGrid(nPeers, W, halfSelf, null, "pack");
  if (packed && packed.length >= nPeers) return packed;

  const legacy = pickPeerCellsForGrid(nPeers, W, halfSelf, null, "maxCell");
  if (legacy && legacy.length >= nPeers) return legacy;

  for (let bump = 0; bump < 48; bump++) {
    const targetSlots = nPeers + 4 + bump;
    const cols = Math.max(1, Math.ceil(Math.sqrt(targetSlots)));
    const rows = Math.ceil(targetSlots / cols);
    const cellW = W / cols;
    const cellH = W / rows;
    const hp = peerHalfUniform(cellW, cellH);
    const candidates: { cell: PeerCell; d: number }[] = [];
    for (let idx = 0; idx < cols * rows; idx++) {
      const c = cellCenter(idx, cols, W, rows);
      if (peerSquareOverlapsSelf(c.cx, c.cy, hp, W, halfSelf)) continue;
      const d = Math.hypot(c.cx - W / 2, c.cy - W / 2);
      candidates.push({ cell: c, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    if (candidates.length >= nPeers) {
      return candidates.slice(0, nPeers).map((x) => x.cell);
    }
  }
  return [];
}

function halfSelfForCanvas(W: number, nPeers: number): number {
  if (nPeers <= 0) return W * 0.33;
  const s = Math.sqrt(Math.max(1, nPeers));
  return W * Math.min(0.26, Math.max(0.155, 0.175 + 0.082 / s));
}

export function YahooCircleCanvas({ self, usersWithIcons }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRevokeRef = useRef<(() => void) | null>(null);
  const [sizePx, setSizePx] = useState(0);
  const [captureReady, setCaptureReady] = useState(false);
  const slots = useMemo(
    () => layoutUsers(usersWithIcons),
    [usersWithIcons],
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      let w = Math.round(el.getBoundingClientRect().width);
      if (w < 16 && typeof window !== "undefined") {
        w = Math.min(Math.max(window.innerWidth - 48, 280), 720);
      }
      if (w > 0) setSizePx(w);
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    ro?.observe(el);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (sizePx < 16) {
      if (sizePx > 0) setCaptureReady(true);
      return;
    }

    let cancelled = false;
    setCaptureReady(false);

    const run = async () => {
      blobRevokeRef.current?.();
      blobRevokeRef.current = null;

      const W = sizePx;
      const dpr = Math.min(
        2.5,
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      );

      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(W * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${W}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (!cancelled) setCaptureReady(true);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, W);

      const nPeers = slots.length;
      if (nPeers < 1 && !self.screenName) {
        if (!cancelled) setCaptureReady(true);
        return;
      }

      let halfSelf = halfSelfForCanvas(W, nPeers);
      let peerCells =
        nPeers > 0 ? bestPeerCellsAvoidingCenter(nPeers, W, halfSelf) : [];
      for (let shrink = 0; shrink < 18 && nPeers > 0 && peerCells.length < nPeers; shrink++) {
        halfSelf *= 0.94;
        peerCells = bestPeerCellsAvoidingCenter(nPeers, W, halfSelf);
      }

      const shouldUpgrade = (p?: string, h?: string) =>
        Boolean(p?.trim() && h?.trim() && p !== h);

      const drawPeer = async (i: number) => {
        if (cancelled) return;
        const slot = slots[i];
        const cell = peerCells[i];
        if (!cell) return;
        const half = peerHalfDraw(cell.cellW, cell.cellH);
        const img = await loadImageFirstAvailable(
          undefined,
          slot.user.avatarUrlPreview,
          slot.user.avatarUrl,
        );
        if (cancelled || !img) return;
        drawImageCoverInSquare(ctx, img, cell.cx, cell.cy, half);

        if (shouldUpgrade(slot.user.avatarUrlPreview, slot.user.avatarUrl)) {
          try {
            const hd = await loadImage(slot.user.avatarUrl!.trim());
            if (!cancelled) drawImageCoverInSquare(ctx, hd, cell.cx, cell.cy, half);
          } catch { /* skip */ }
        }
      };

      const selfImg = await loadImageFirstAvailable(
        undefined,
        self.avatarUrlPreview,
        self.avatarUrl,
      );
      if (!cancelled && selfImg && self.screenName) {
        drawImageCoverInSquare(ctx, selfImg, W / 2, W / 2, halfSelf);
      }

      for (let i = 0; i < slots.length; i++) {
        if (cancelled) return;
        await drawPeer(i);
        if (!cancelled && selfImg && self.screenName) {
          drawImageCoverInSquare(ctx, selfImg, W / 2, W / 2, halfSelf);
        }
      }

      if (!cancelled && self.screenName && shouldUpgrade(self.avatarUrlPreview, self.avatarUrl)) {
        try {
          const hd = await loadImage(self.avatarUrl!.trim());
          if (!cancelled) drawImageCoverInSquare(ctx, hd, W / 2, W / 2, halfSelf);
        } catch { /* skip */ }
      }

      if (!cancelled) setCaptureReady(true);
    };

    void run();

    return () => {
      cancelled = true;
      blobRevokeRef.current?.();
      blobRevokeRef.current = null;
    };
  }, [sizePx, self, slots]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-circle-capture-ready={captureReady ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        data-circle-export-canvas="true"
        className="block h-full w-full"
        role="img"
        aria-label={
          self.screenName
            ? `@${self.screenName} 的互动圈`
            : "互动圈"
        }
      />
    </div>
  );
}
