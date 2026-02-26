"use client";

import { createBrowserClient } from "@supabase/ssr";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface ConversationWithDetails {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
  created_at: string;
  other_user_id: string;
  other_user_name: string;
  other_user_image: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

// ─── Conversations ────────────────────────────────────────────────────────────

// Returns the sorted pair so participant_a < participant_b (DB constraint)
function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateConversation(
  myUserId: string,
  otherUserId: string
): Promise<{ conversationId: string | null; error: string | null }> {
  const client = db();
  const [pa, pb] = sortedPair(myUserId, otherUserId);

  // Try to find existing conversation
  const { data: existing } = await client
    .from("conversations")
    .select("id")
    .eq("participant_a", pa)
    .eq("participant_b", pb)
    .maybeSingle();

  if (existing) return { conversationId: existing.id, error: null };

  // Create new conversation (RLS enforces mutual follow)
  const { data, error } = await client
    .from("conversations")
    .insert({ participant_a: pa, participant_b: pb })
    .select("id")
    .single();

  if (error) return { conversationId: null, error: (error as { message: string }).message };
  return { conversationId: (data as { id: string }).id, error: null };
}

export async function getConversations(
  userId: string
): Promise<ConversationWithDetails[]> {
  const client = db();

  const { data: convRows } = await client
    .from("conversations")
    .select("id, participant_a, participant_b, last_message_at, created_at")
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!convRows || convRows.length === 0) return [];

  type ConvRow = {
    id: string;
    participant_a: string;
    participant_b: string;
    last_message_at: string | null;
    created_at: string;
  };

  const rows = convRows as ConvRow[];

  // Collect other user IDs
  const otherUserIds = rows.map((r) =>
    r.participant_a === userId ? r.participant_b : r.participant_a
  );

  // Batch-fetch the other users' profiles
  const { data: profileRows } = await client
    .from("profiles")
    .select("user_id, name, image_url")
    .in("user_id", otherUserIds);

  type PRow = { user_id: string; name: string; image_url: string | null };
  const profileMap = new Map(
    ((profileRows ?? []) as PRow[]).map((p) => [p.user_id, p])
  );

  // Fetch last message preview + unread count for each conversation
  const results = await Promise.all(
    rows.map(async (conv) => {
      const otherUserId = conv.participant_a === userId ? conv.participant_b : conv.participant_a;
      const profile = profileMap.get(otherUserId);

      const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
        client
          .from("direct_messages")
          .select("content, sender_id")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1),
        client
          .from("direct_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", userId)
          .is("read_at", null),
      ]);

      type MsgRow = { content: string; sender_id: string };
      const lastMsg = ((lastMsgs ?? []) as MsgRow[])[0];

      return {
        id: conv.id,
        participant_a: conv.participant_a,
        participant_b: conv.participant_b,
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
        other_user_id: otherUserId,
        other_user_name: profile?.name ?? "Unknown",
        other_user_image: profile?.image_url ?? null,
        last_message_preview: lastMsg?.content ?? null,
        unread_count: unread ?? 0,
      };
    })
  );

  return results;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  limit = 50,
  before?: string   // ISO timestamp cursor for pagination
): Promise<DirectMessage[]> {
  const client = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = client
    .from("direct_messages")
    .select("id, conversation_id, sender_id, content, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data } = await query;
  return ((data ?? []) as DirectMessage[]);
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<{ message: DirectMessage | null; error: string | null }> {
  const { data, error } = await db()
    .from("direct_messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() })
    .select()
    .single();

  if (error) return { message: null, error: (error as { message: string }).message };
  return { message: data as DirectMessage, error: null };
}

export async function markMessagesRead(
  conversationId: string,
  userId: string
): Promise<void> {
  await db()
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);
}

// ─── Unread count across all conversations ────────────────────────────────────

export async function getTotalUnreadCount(userId: string): Promise<number> {
  const client = db();

  // Get all conversations for this user
  const { data: convRows } = await client
    .from("conversations")
    .select("id")
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`);

  if (!convRows || convRows.length === 0) return 0;

  const convIds = convRows.map((r) => (r as { id: string }).id);

  const { count } = await client
    .from("direct_messages")
    .select("*", { count: "exact", head: true })
    .in("conversation_id", convIds)
    .neq("sender_id", userId)
    .is("read_at", null);

  return count ?? 0;
}
