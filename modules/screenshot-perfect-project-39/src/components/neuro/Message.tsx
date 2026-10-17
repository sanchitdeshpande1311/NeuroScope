import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, Square, Volume2 } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Logo } from "./Logo";

const cleanRoboticHeaders = (content: string) =>
  content
    .replace(/^###?\s*(General\s+)?Educational\s+Explanation\s*:?\s*\n+/i, "")
    .replace(/^###?\s*Facts\s+from\s+the\s+project\s+statement\s*:?\s*\n+/i, "")
    .replace(/^\*\*(General\s+)?Educational\s+Explanation\*\*\s*:?\s*\n+/i, "")
    .replace(/^###?\s*General\s+Explanation\s*:?\s*\n+/i, "")
    .trimStart();

export const messageText = (m: UIMessage) =>
  cleanRoboticHeaders(m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""));


export function Message({
  message,
  speaking,
  onSpeak,
  onStopSpeak,
  canSpeak,
}: {
  message: UIMessage;
  speaking: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
  canSpeak: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const text = messageText(message);

  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-primary/40 bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
          {text}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        <Logo compact />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose-neuro text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {text}
          </ReactMarkdown>
        </div>
        {text && (
          <div className="mt-2 flex gap-1 text-muted-foreground">
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {canSpeak && (
              <button
                onClick={speaking ? onStopSpeak : onSpeak}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted hover:text-foreground"
              >
                {speaking ? <Square className="h-3.5 w-3.5 text-primary" /> : <Volume2 className="h-3.5 w-3.5" />}
                {speaking ? "Stop speaking" : "Read aloud"}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
