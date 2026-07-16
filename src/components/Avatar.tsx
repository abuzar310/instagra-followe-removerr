"use client";

import { useState } from "react";

/* Instagram profile picture with graceful fallback.
 * CDN images are loaded through /api/instagram/image to bypass IG's
 * hotlink protection. On any failure we render colored initials instead.
 */

const PALETTE = [
  "#6366f1", "#ec4899", "#f97316", "#22c55e",
  "#06b6d4", "#8b5cf6", "#eab308", "#ef4444",
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function Avatar({
  src,
  username,
  size = 32,
}: {
  src?: string;
  username: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const showImg = src && src.length > 5 && !failed;
  const initial = (username[0] || "?").toUpperCase();
  const color = hashColor(username);

  if (!showImg) {
    return (
      <div
        className="rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none"
        style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
        title={`@${username}`}
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/instagram/image?url=${encodeURIComponent(src)}`}
      alt={`@${username}`}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-full object-cover shrink-0 bg-[#27272a]"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
