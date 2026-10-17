import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Square, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition, type MicError } from "@/hooks/use-speech";

const MIC_MSG: Record<Exclude<MicError, null>, string> = {
  unsupported: "Voice input isn't supported in this browser (try Chrome or Edge). Typing still works.",
  denied: "Microphone permission was denied. Enable it in your browser's site settings to use voice.",
  "no-speech": "No speech was detected. Try again and speak clearly.",
  failed: "Speech recognition failed. Please try again or type your question.",
};

export function Composer({
  onSend,
  busy,
  onStop,
  lang,
  speaking,
  onStopSpeaking,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  lang: string;
  speaking: boolean;
  onStopSpeaking: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const before = useRef("");
  const mic = useSpeechRecognition(lang, (fin) => {
    setText((t) => (t ? `${t} ${fin}` : fin));
  });

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text, mic.interim]);

  useEffect(() => {
    if (!mic.error) return;
    const timer = setTimeout(() => mic.setError(null), 5000);
    return () => clearTimeout(timer);
  }, [mic.error, mic]);

  const submit = () => {
    const v = text.trim();
    if (!v || busy) return;
    if (mic.listening) mic.stop();
    onSend(v);
    setText("");
  };

  return (
    <div className="space-y-2">
      {mic.error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          <span>{MIC_MSG[mic.error]}</span>
          <button aria-label="Dismiss" onClick={() => mic.setError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="rounded-2xl border-2 border-canvas-border bg-canvas-card shadow-panel transition-all focus-within:border-primary focus-within:shadow-crimson">
        {mic.listening && (
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-primary">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            Listening…
            <div className="flex h-4 items-end gap-0.5" aria-hidden>
              {[0.5, 0.8, 1, 0.8, 0.5].map((k, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-primary transition-all duration-75"
                  style={{ height: `${Math.max(12, mic.level * k * 100)}%` }}
                />
              ))}
            </div>
            <span className="ml-auto text-muted-foreground">Edit the transcript before sending</span>
          </div>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={mic.listening && mic.interim ? `${text}${text ? " " : ""}${mic.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => (before.current = text)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about MRI sequences, WT/TC/ET, volumes, Dice…"
          aria-label="Message"
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          {mic.listening ? (
            <>
              <Button size="sm" variant="secondary" onClick={mic.stop} className="gap-1.5">
                <MicOff className="h-4 w-4" /> Stop
              </Button>
              <Button size="sm" variant="ghost" onClick={mic.cancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Start voice input"
              onClick={() => (mic.supported ? mic.start() : mic.setError("unsupported"))}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary"
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}
          {speaking && (
            <Button size="sm" variant="ghost" onClick={onStopSpeaking} className="gap-1.5 text-primary">
              <VolumeX className="h-4 w-4" /> Stop speaking
            </Button>
          )}
          <div className="ml-auto">
            {busy ? (
              <Button size="icon" aria-label="Stop generating" onClick={onStop} className="h-9 w-9 rounded-full">
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label="Send message"
                onClick={submit}
                disabled={!text.trim()}
                className="h-9 w-9 rounded-full bg-primary hover:bg-crimson-deep text-white font-bold shadow-sm disabled:opacity-30 transition-all"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
