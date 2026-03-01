"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  type DirectMessage,
} from "@/lib/messaging";
import { createClient } from "@/lib/supabase";

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=888&size=${size * 2}&bold=true`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? fallback}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, boxShadow: "0 0 0 2px var(--border)" }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageThreadPage() {
  const params = useParams();
  const otherUserId = typeof params.userId === "string" ? params.userId : "";
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [otherName, setOtherName] = useState("User");
  const [otherImage, setOtherImage] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load other user's profile name
  useEffect(() => {
    if (!otherUserId) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("name, image_url")
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const p = data as { name: string; image_url: string | null };
          setOtherName(p.name);
          setOtherImage(p.image_url);
        }
      });
  }, [otherUserId]);

  // Init conversation + load messages
  const init = useCallback(async () => {
    if (!user || !otherUserId) return;
    const { conversationId: convId, error: convErr } = await getOrCreateConversation(user.id, otherUserId);
    if (convErr || !convId) {
      setError(convErr ?? "Could not start conversation. Make sure you both follow each other.");
      setInitLoading(false);
      return;
    }
    setConversationId(convId);

    const msgs = await getMessages(convId, 50);
    setMessages(msgs);
    setInitLoading(false);

    // Mark messages as read
    await markMessagesRead(convId, user.id);
  }, [user, otherUserId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/profile"); return; }
    init();
  }, [user, authLoading, init, router]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId || !user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          setMessages((prev) => {
            // Avoid duplicate if we already appended it optimistically
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Mark read if it's from the other user
          if (newMsg.sender_id !== user.id) {
            markMessagesRead(conversationId, user.id);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !conversationId || !user || sending) return;
    setSending(true);
    setInput("");

    // Optimistic append
    const tempId = `temp-${Date.now()}`;
    const optimistic: DirectMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);

    const { message, error: sendErr } = await sendMessage(conversationId, user.id, content);
    if (sendErr) {
      setError(sendErr);
      // Roll back optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content); // restore input
    } else if (message) {
      // Replace temp with real message
      setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading || initLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <p className="font-black text-white mb-2">Can&apos;t open conversation</p>
        <p className="text-sm mb-5 text-navy-200">{error}</p>
        <Link
          href="/messages"
          className="btn-dark inline-block py-2.5 px-5 rounded-xl text-sm font-black uppercase tracking-wide"
        >
          ← Messages
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100dvh - 64px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 bg-navy-950 border-b border-navy-500">
        <Link href="/messages" className="text-lg font-black mr-1 text-navy-200 hover:text-white transition-colors">
          ←
        </Link>
        <Avatar src={otherImage} name={otherName} size={38} />
        <div>
          <p className="font-black text-white text-sm leading-tight">{otherName}</p>
          <p className="text-[10px] font-bold text-navy-200">Direct message</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm py-8 text-navy-200">
            No messages yet — say hi! 👋
          </p>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender_id === user?.id;
          const showTime =
            i === 0 ||
            new Date(msg.created_at).getTime() -
              new Date(messages[i - 1].created_at).getTime() >
              5 * 60_000;

          return (
            <div key={msg.id}>
              {showTime && (
                <p className="text-center text-[10px] font-bold my-2 text-navy-200">
                  {formatTime(msg.created_at)}
                </p>
              )}
              <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-snug ${
                    isMe ? "text-white rounded-br-md" : "text-gray-200 rounded-bl-md"
                  }`}
                  style={isMe
                    ? { background: "rgba(253,41,123,0.12)", border: "1px solid rgba(253,41,123,0.25)" }
                    : { background: "var(--bg-elevated)", border: "1px solid var(--border)" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0 flex items-end gap-2 border-t border-navy-500 bg-navy-950">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          maxLength={2000}
          className="game-input flex-1 resize-none !rounded-xl !px-3.5 !py-2.5 text-sm"
          style={{ maxHeight: 120, lineHeight: "1.4" }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40 active:scale-95"
          style={{ background: "rgba(253,41,123,0.15)", border: "1px solid rgba(253,41,123,0.35)", color: "var(--accent)" }}
          style={{ fontSize: 18 }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
