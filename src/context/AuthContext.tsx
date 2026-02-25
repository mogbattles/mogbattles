"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { loadUserPermissions, type UserPermissions } from "@/lib/user_roles";

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
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  permissions: GUEST_PERMISSIONS,
  signOut: async () => {},
  refreshPermissions: async () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [session, setSession]   = useState<Session | null>(null);
  const [loading, setLoading]   = useState(true);
  const [permissions, setPerms] = useState<UserPermissions>(GUEST_PERMISSIONS);

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
    <AuthContext.Provider value={{ user, session, loading, permissions, signOut, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Convenience hook ─────────────────────────────────────────────────────────

export function usePermissions() {
  return useContext(AuthContext).permissions;
}
