"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/markdown-text";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  "How many active members do we have and what's the trend?",
  "Which leads need follow-up this week?",
  "Are there any compliance certifications expiring soon?",
  "What products are running low on stock?",
  "Give me a summary of open tasks and priorities",
  "How is retention tracking compared to last month?",
];

export default function AdvisorClient() {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [error, setError]             = useState("");
  const bottomRef                     = useRef<HTMLDivElement>(null);
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError("");

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = "AI advisor error";
        try {
          const parsed = JSON.parse(errText);
          const e = parsed.error;
          msg = (typeof e === "string" ? e : e?.message) ?? parsed.message ?? msg;
        } catch {}
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${msg}` };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        const snapshot = fullText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: snapshot };
          return updated;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "⚠️ Something went wrong. Please try again." };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">BFC AI Advisor</h1>
        <p className="text-sm text-muted-foreground">
          Powered by Claude · Knows your live platform data
        </p>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask me anything about BFC — members, finances, compliance, leads, inventory, or operations.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-lg border p-3 text-left text-sm hover:bg-muted transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              }`}
            >
              {msg.role === "user" ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                <MarkdownText content={msg.content} />
              )}
              {msg.role === "assistant" && streaming && idx === messages.length - 1 && (
                <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse bg-current opacity-70" />
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask BFC Advisor… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <Button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="h-12 px-5 rounded-xl"
        >
          {streaming ? "…" : "Send"}
        </Button>
      </div>

      {messages.length > 0 && (
        <button
          onClick={() => setMessages([])}
          className="text-xs text-muted-foreground hover:text-foreground text-center"
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
