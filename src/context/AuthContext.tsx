"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { loadUserPermissions, type UserPermissions } from "@/lib/user_roles";

// Minimal profile shape for impersonation (avoid importing full ProfileRow to keep context light)
export interface ImpersonatedProfile {
  id: string;
  name: string;
  image_url: string | null;
}

// ─── Default (guest) permissions ─────────────────────────────────────────────

const GUEST_PERMISSIONS: UserPermissions = {
  roles: new Set(),
  isMember: false,
  isPremium: false,
  isModerator: false,
  isAdmin: false,
  isArenaParticipant: false,
  canVote: true,
  canCreateArena: false,
  canCommentForum: false,
  canPostThread: false,
  canApproveProfiles: false,
  canWriteArticles: false,
  canManageNews: false,
  canEditAbout: false,
  canAccessAdmin: false,
  canGrantRoles: false,
  canCreateOfficialArena: false,
  canCreateModeratorArena: false,
  canCreateProfile: false,
  canCreateSeedProfile: false,
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  permissions: UserPermissions;
  signOut: () => Promise<void>;
  /** Re-fetch roles (call after phone verification or plan change) */
  refreshPermissions: () => Promise<void>;
  /** Admin impersonation of seeded profiles */
  impersonatingProfile: ImpersonatedProfile | null;
  setImpersonatingProfile: (profile: ImpersonatedProfile | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  permissions: GUEST_PERMISSIONS,
  signOut: async () => {},
  refreshPermissions: async () => {},
  impersonatingProfile: null,
  setImpersonatingProfile: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [session, setSession]   = useState<Session | null>(null);
  const [loading, setLoading]   = useState(true);
  const [permissions, setPerms] = useState<UserPermissions>(GUEST_PERMISSIONS);
  const [impersonatingProfile, setImpersonatingProfile] = useState<ImpersonatedProfile | null>(null);

  async function fetchPermissions(uid: string | null) {
    const perms = await loadUserPermissions(uid);
    setPerms(perms);
  }

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setSession(data.session);
      setUser(u);
      fetchPermissions(u?.id ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setSession(session);
        setUser(u);
        fetchPermissions(u?.id ?? null);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setPerms(GUEST_PERMISSIONS);
  };

  const refreshPermissions = async () => {
    if (user) await fetchPermissions(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, permissions, signOut, refreshPermissions, impersonatingProfile, setImpersonatingProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Convenience hooks ───────────────────────────────────────────────────────

export function usePermissions() {
  return useContext(AuthContext).permissions;
}

export function useImpersonation() {
  const { impersonatingProfile, setImpersonatingProfile, permissions } = useContext(AuthContext);
  return {
    isImpersonating: impersonatingProfile !== null,
    profile: impersonatingProfile,
    canImpersonate: permissions.isAdmin,
    start: (p: ImpersonatedProfile) => setImpersonatingProfile(p),
    stop: () => setImpersonatingProfile(null),
  };
}
