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
          category_id: string | null;
          arena_tier: ArenaTier;
          affects_elo: boolean;
          visibility: "public" | "private";
          arena_type: "fixed" | "open" | "request";
          creator_id: string | null;
          is_verified: boolean;
          invite_token: string;
          created_at: string;
          thumbnail_url: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          is_official?: boolean;
          category?: string | null;
          category_id?: string | null;
          arena_tier?: ArenaTier;
          affects_elo?: boolean;
          visibility?: "public" | "private";
          arena_type?: "fixed" | "open" | "request";
          creator_id?: string | null;
          is_verified?: boolean;
          thumbnail_url?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          category_id?: string | null;
          arena_tier?: ArenaTier;
          affects_elo?: boolean;
          visibility?: "public" | "private";
          arena_type?: "fixed" | "open" | "request";
          is_verified?: boolean;
          thumbnail_url?: string | null;
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
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      conversations: {
        Row: {
          id: string;
          participant_a: string;
          participant_b: string;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          participant_a: string;
          participant_b: string;
          last_message_at?: string | null;
          created_at?: string;
        };
        Update: {
          last_message_at?: string | null;
        };
      };
      direct_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          read_at?: string | null;
        };
      };
      live_streams: {
        Row: {
          id: string;
          host_id: string;
          room_name: string;
          title: string;
          is_active: boolean;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          host_id: string;
          room_name: string;
          title?: string;
          is_active?: boolean;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          title?: string;
          is_active?: boolean;
          ended_at?: string | null;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          parent_id: string | null;
          thing_type: string;
          depth: number;
          path: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          parent_id?: string | null;
          thing_type?: string;
          depth?: number;
          path?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          icon?: string | null;
          parent_id?: string | null;
          thing_type?: string;
          depth?: number;
          path?: string;
          sort_order?: number;
          is_active?: boolean;
        };
      };
      profile_categories: {
        Row: {
          profile_id: string;
          category_id: string;
        };
        Insert: {
          profile_id: string;
          category_id: string;
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
      is_mutual_follow: {
        Args: { a: string; b: string };
        Returns: boolean;
      };
      get_category_descendants: {
        Args: { root_id: string };
        Returns: { id: string }[];
      };
      get_category_ancestors: {
        Args: { cat_id: string };
        Returns: { id: string; name: string; slug: string; depth: number }[];
      };
    };
  };
}

// ─── Arena tier type ──────────────────────────────────────────────────────────

export type ArenaTier = "official" | "moderator" | "custom";

// ─── Convenience type aliases ─────────────────────────────────────────────────

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type ArenaRow = Tables<"arenas">;
export type ProfileRow = Tables<"profiles">;
export type ArenaProfileStatsRow = Tables<"arena_profile_stats">;
export type UserVoteRow = Tables<"user_votes">;
export type CategoryRow = Tables<"categories">;

// ─── Browser client ───────────────────────────────────────────────────────────
// Call createClient() inside component/hook bodies — never at module level.

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
