import { createBrowserClient } from "@supabase/ssr";

// ─── Database Types ───────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type ProfileCategory =
  | "actors"
  | "looksmaxxers"
  | "singers"
  | "athletes"
  | "streamers"
  | "politicians"
  | "political_commentators"
  | "models";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          image_url: string | null;
          image_urls: string[];
          categories: string[];
          elo_rating: number;
          total_wins: number;
          total_losses: number;
          total_matches: number;
          is_test_profile: boolean;
          wikipedia_slug: string | null;
          category: ProfileCategory | null;
          user_id: string | null;
          height_in: number | null;
          weight_lbs: number | null;
          country: string | null;
          gender: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          image_url?: string | null;
          image_urls?: string[];
          categories?: string[];
          elo_rating?: number;
          total_wins?: number;
          total_losses?: number;
          total_matches?: number;
          is_test_profile?: boolean;
          wikipedia_slug?: string | null;
          category?: ProfileCategory | null;
          user_id?: string | null;
          height_in?: number | null;
          weight_lbs?: number | null;
          country?: string | null;
          gender?: string | null;
        };
        Update: {
          name?: string;
          image_url?: string | null;
          image_urls?: string[];
          categories?: string[];
          elo_rating?: number;
          total_wins?: number;
          total_losses?: number;
          total_matches?: number;
          is_test_profile?: boolean;
          wikipedia_slug?: string | null;
          category?: ProfileCategory | null;
          user_id?: string | null;
          height_in?: number | null;
          weight_lbs?: number | null;
          country?: string | null;
          gender?: string | null;
        };
      };
      arenas: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_official: boolean;
          category: string | null;
          visibility: "public" | "private";
          arena_type: "fixed" | "open" | "request";
          creator_id: string | null;
          is_verified: boolean;
          invite_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          is_official?: boolean;
          category?: string | null;
          visibility?: "public" | "private";
          arena_type?: "fixed" | "open" | "request";
          creator_id?: string | null;
          is_verified?: boolean;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          visibility?: "public" | "private";
          arena_type?: "fixed" | "open" | "request";
          is_verified?: boolean;
        };
      };
      arena_profile_stats: {
        Row: {
          arena_id: string;
          profile_id: string;
          elo_rating: number;
          wins: number;
          losses: number;
          matches: number;
        };
        Insert: {
          arena_id: string;
          profile_id: string;
          elo_rating?: number;
          wins?: number;
          losses?: number;
          matches?: number;
        };
        Update: {
          elo_rating?: number;
          wins?: number;
          losses?: number;
          matches?: number;
        };
      };
      arena_members: {
        Row: {
          arena_id: string;
          profile_id: string;
          status: "approved" | "pending";
          added_by: string | null;
          added_at: string;
        };
        Insert: {
          arena_id: string;
          profile_id: string;
          status?: "approved" | "pending";
          added_by?: string | null;
        };
        Update: {
          status?: "approved" | "pending";
        };
      };
      matches: {
        Row: {
          id: string;
          winner_id: string;
          loser_id: string;
          winner_elo_before: number;
          loser_elo_before: number;
          winner_elo_after: number;
          loser_elo_after: number;
          arena_id: string | null;
        };
        Insert: {
          winner_id: string;
          loser_id: string;
          winner_elo_before: number;
          loser_elo_before: number;
          winner_elo_after: number;
          loser_elo_after: number;
          arena_id?: string | null;
        };
        Update: Record<string, never>;
      };
      user_votes: {
        Row: {
          id: string;
          voter_id: string;
          arena_id: string;
          profile_a: string;
          profile_b: string;
          winner_id: string;
          voted_at: string;
        };
        Insert: {
          voter_id: string;
          arena_id: string;
          profile_a: string;
          profile_b: string;
          winner_id: string;
        };
        Update: Record<string, never>;
      };
    };
    Functions: {
      record_match: {
        Args: {
          p_arena_id: string;
          p_winner_id: string;
          p_loser_id: string;
          p_voter_id?: string | null;
        };
        Returns: {
          winner_elo_before: number;
          winner_elo_after: number;
          loser_elo_before: number;
          loser_elo_after: number;
        };
      };
      delete_profile: {
        Args: { p_id: string };
        Returns: void;
      };
    };
  };
}

// ─── Convenience type aliases ─────────────────────────────────────────────────

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type ArenaRow = Tables<"arenas">;
export type ProfileRow = Tables<"profiles">;
export type ArenaProfileStatsRow = Tables<"arena_profile_stats">;
export type UserVoteRow = Tables<"user_votes">;

// ─── Browser client ───────────────────────────────────────────────────────────
// Call createClient() inside component/hook bodies — never at module level.

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
