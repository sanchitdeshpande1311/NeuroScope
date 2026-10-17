import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, Menu, Plus, RotateCcw } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { newId, threadStore, loadPrefs, savePrefs, type Prefs } from "@/lib/threads";
import { useCaseContext } from "@/lib/case-store";
import { useSpeechSynthesis } from "@/hooks/use-speech";
import { Message, messageText } from "./Message";
import { Composer } from "./Composer";
import { Sidebar } from "./Sidebar";
import { Logo } from "./Logo";

const SUGGESTIONS = [
  "Explain the NeuroScope 3D project.",
  "What are T1, T1Gd, T2 and FLAIR?",
  "Explain WT, TC and ET.",
  "How is volume calculated?",
  "What are Dice and sensitivity?",
  "Explain the MONAI SegResNet model.",
  "What are the judging criteria?",
  "What are the model's limitations?",
];

function parseError(e: Error | undefined) {
  if (!e) return "";
  try {
    return JSON.parse(e.message).error ?? e.message;
  } catch {
    return e.message || "Something went wrong.";
  }
}

export function ChatWindow({ threadId }: { threadId: string }) {
  const navigate = useNavigate();
  const ctx = useCaseContext();
  const [prefs, setPrefs] = useState<Prefs>({ lang: "en-US", autoSpeak: false });
  const [online, setOnline] = useState<boolean | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tts = useSpeechSynthesis();
  const initial = useMemo(() => threadStore.get(threadId)?.messages ?? [], [threadId]);

  useEffect(() => setPrefs(loadPrefs()), []);
  const updatePrefs = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const n = { ...cur, ...p };
      savePrefs(n);
      return n;
    });

  useEffect(() => {
    const check = () =>
      fetch("/api/chat")
        .then((r) => setOnline(r.ok && navigator.onLine))
        .catch(() => setOnline(false));
    check();
    const id = setInterval(check, 30000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { conversationId: threadId } }),
    [threadId],
  );
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({
    id: threadId,
    messages: initial,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // Persist completed turns (text only).
  useEffect(() => {
    if (status === "ready" || status === "error") threadStore.saveMessages(threadId, messages);
  }, [messages, status, threadId]);

  // Optional auto read-aloud.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready" && prefs.autoSpeak) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") tts.speak(last.id, messageText(last), prefs.lang);
    }
    prevStatus.current = status;
  }, [status, messages, prefs, tts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTo({ top: el.scrollHeight });
  }, [messages, status, atBottom]);

  const send = (text: string) => {
    clearError();
    tts.stop();
    setAtBottom(true);
    sendMessage({ text }, { body: { caseContext: ctx } });
  };

  const newChat = () => {
    const id = newId();
    threadStore.ensure(id);
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  const last = messages[messages.length - 1];
  const waiting = status === "submitted" || (status === "streaming" && last?.role === "assistant" && !messageText(last));

  return (
    <div className="flex h-dvh bg-background">
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <Sidebar activeId={threadId} />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 border-sidebar-border p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar activeId={threadId} onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col bg-parchment-pattern">
        <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#3d2325] px-5 py-3 text-white shadow-md overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_10px_var(--crimson)]" />

          <Button size="icon" variant="ghost" className="relative z-10 md:hidden text-white hover:bg-white/10" aria-label="Open menu" onClick={() => setMobileNav(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            to="/"
            className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/20 hover:bg-primary/30 px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-primary" />
            <span>3D Overview</span>
          </Link>
          <div className="relative z-10 min-w-0">
            <h1 className="truncate text-base font-bold text-white tracking-tight font-serif">NeuroScope AI Assistant</h1>
            <div className="flex items-center gap-1.5 text-xs text-[#d1beb4]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : online === false ? "bg-destructive" : "bg-muted-foreground"}`}
              />
              {online === null ? "Checking…" : online ? "Online" : "Offline"}
            </div>
          </div>
          <div className="relative z-10 ml-auto flex items-center gap-3">
            <label className="hidden items-center gap-2 text-xs text-[#d1beb4] lg:flex">
              <Switch checked={prefs.autoSpeak} onCheckedChange={(v) => updatePrefs({ autoSpeak: v })} disabled={!tts.supported} />
              Speak responses
            </label>
            <Select value={prefs.lang} onValueChange={(v) => updatePrefs({ lang: v as Prefs["lang"] })}>
              <SelectTrigger className="h-8 w-[130px] text-xs border-white/20 bg-[#2c1719] text-white" aria-label="Voice language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#2c1719] text-white border-primary/30 shadow-xl">
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="en-IN">English (India)</SelectItem>
                <SelectItem value="hi-IN">हिन्दी (Hindi)</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="default" onClick={newChat} className="gap-1.5 bg-primary text-white hover:bg-primary/90 shadow-sm">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}
          className="relative flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
            {messages.length === 0 && (
              <div className="pt-6 md:pt-12">
                <Logo compact />
                <h2 className="mt-5 font-serif text-2xl font-bold text-ink md:text-3xl tracking-tight">
                  Welcome to NeuroScope AI Assistant.
                </h2>
                <div className="mt-3 h-0.5 w-12 bg-border-rule" />
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-body-text">
                  I can explain brain MRI sequences, WT/TC/ET segmentation, estimated volumes, evaluation metrics and the
                  complete NeuroScope 3D research workflow.
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body-text">
                  Ask your question by typing or using the microphone. When verified study results are available, I can
                  explain them using the supplied data.
                </p>
                <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-canvas-border bg-canvas-card p-4 text-left text-sm text-ink transition-all hover:border-primary hover:shadow-md hover:bg-canvas-subtle"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                canSpeak={tts.supported}
                speaking={tts.speakingId === m.id}
                onSpeak={() => tts.speak(m.id, messageText(m), prefs.lang)}
                onStopSpeak={tts.stop}
              />
            ))}
            {waiting && (
              <div className="flex items-center gap-3">
                <Logo compact />
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-dot rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="flex-1 text-foreground">{parseError(error)}</div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => regenerate({ body: { caseContext: ctx } })}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            )}
          </div>
          {!atBottom && (
            <button
              aria-label="Scroll to latest"
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
              className="sticky bottom-4 left-1/2 mx-auto block -translate-x-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground shadow-panel hover:text-primary"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <Composer
            onSend={send}
            busy={busy}
            onStop={stop}
            lang={prefs.lang}
            speaking={tts.speakingId !== null}
            onStopSpeaking={tts.stop}
          />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Research and teaching prototype only. This assistant explains research workflows and model outputs; it does
            not diagnose or recommend treatment.
          </p>
        </div>
      </main>
    </div>
  );
}
