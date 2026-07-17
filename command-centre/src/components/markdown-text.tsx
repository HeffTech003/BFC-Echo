"use client";

/**
 * Lightweight markdown renderer for AI advisor responses.
 * Handles: headings, bold, italic, inline code, bullet lists, numbered lists, line breaks.
 * Content comes only from our own AI — not user input.
 */

function parseMarkdown(text: string): string {
  return text
    // Headings
    .replace(/^#{3}\s+(.+)$/gm, "<h3 class=\"font-semibold text-sm mt-3 mb-1\">$1</h3>")
    .replace(/^#{2}\s+(.+)$/gm, "<h2 class=\"font-semibold text-sm mt-3 mb-1\">$1</h2>")
    .replace(/^#{1}\s+(.+)$/gm, "<h2 class=\"font-semibold text-sm mt-3 mb-1\">$1</h2>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code class=\"bg-muted px-1 rounded text-xs font-mono\">$1</code>")
    // Bullet lists — convert consecutive lines starting with - or * into <ul>
    .replace(/((?:^[-*]\s+.+\n?)+)/gm, (block) => {
      const items = block.trim().split("\n").map(line =>
        `<li class="ml-4 list-disc">${line.replace(/^[-*]\s+/, "")}</li>`
      ).join("");
      return `<ul class="space-y-0.5 my-1">${items}</ul>`;
    })
    // Numbered lists
    .replace(/((?:^\d+\.\s+.+\n?)+)/gm, (block) => {
      const items = block.trim().split("\n").map(line =>
        `<li class="ml-4 list-decimal">${line.replace(/^\d+\.\s+/, "")}</li>`
      ).join("");
      return `<ol class="space-y-0.5 my-1">${items}</ol>`;
    })
    // Double newline → paragraph break
    .replace(/\n\n/g, "</p><p class=\"mt-2\">")
    // Single newline → line break
    .replace(/\n/g, "<br/>");
}

export function MarkdownText({ content, className = "" }: { content: string; className?: string }) {
  if (!content) return null;
  const html = `<p>${parseMarkdown(content)}</p>`;
  return (
    <div
      className={`leading-relaxed ${className}`}
      // Safe: content is exclusively from our own Anthropic API calls
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
