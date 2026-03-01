"use client";

import { useImpersonation } from "@/context/AuthContext";

export default function ImpersonationBanner() {
  const { isImpersonating, profile, stop } = useImpersonation();
  if (!isImpersonating || !profile) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 py-2 px-4 text-sm font-bold"
      style={{
        background: "var(--text-primary)",
        color: "var(--bg-primary)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }}
    >
      {profile.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.image_url}
          alt={profile.name}
          className="w-6 h-6 rounded-full object-cover border border-white/30"
        />
      )}
      <span>Acting as: <strong>{profile.name}</strong></span>
      <button
        onClick={stop}
        className="ml-2 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
