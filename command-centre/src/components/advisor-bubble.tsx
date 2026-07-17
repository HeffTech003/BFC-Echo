"use client";

/**
 * Floating AI Advisor chat bubble — available on every page.
 * Sits bottom-right, expands into a chat panel on click.
 * Uses the same /api/advisor streaming endpoint as the full Advisor page.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { MarkdownText } from "@/components/markdown-text";

type Message = { role: "user" | "assistant"; content: string };

export default function AdvisorBubble() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = "Advisor error";
        try { const p = JSON.parse(errText); msg = p.error?.message ?? p.error ?? p.message ?? msg; } catch {}
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: `⚠️ ${msg}` }; return u; });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        const snapshot = full;
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: snapshot }; return u; });
      }
    } catch {
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: "⚠️ Network error. Try again." }; return u; });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="flex flex-col w-80 sm:w-96 h-[480px] rounded-2xl shadow-2xl border border-border bg-background overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-red-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
              <span className="font-semibold text-sm">BFC AI Advisor</span>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-white/70 hover:text-white text-xs"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">×</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs">Ask me anything about the gym — members, leads, finance, compliance, inventory.</p>
                {[
                  "How is BFC going overall?",
                  "Which leads need follow-up?",
                  "Any compliance expiries coming up?",
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="w-full text-left text-xs rounded-lg border border-border p-2 hover:bg-muted transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-red-600 text-white"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.role === "user" ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : msg.content ? (
                    <MarkdownText content={msg.content} />
                  ) : null}
                  {!msg.content && (streaming && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border p-3 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask the advisor…"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-red-600"
            />
            <button
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="shrink-0 h-8 w-8 rounded-lg bg-red-600 text-white flex items-center justify-center hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="h-14 w-14 rounded-full bg-red-600 text-white shadow-xl hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center"
        title="BFC AI Advisor"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.704 6.192l-1.15 3.443a.75.75 0 0 0 1 .956l3-1.028Z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </div>
  );
}
