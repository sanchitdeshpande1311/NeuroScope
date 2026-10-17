import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { newId, threadStore, useThreads } from "@/lib/threads";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

export function Sidebar({ activeId, onNavigate }: { activeId: string; onNavigate?: () => void }) {
  const threads = useThreads();
  const navigate = useNavigate();
  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  const newChat = () => {
    const id = newId();
    threadStore.ensure(id);
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col gap-4 bg-sidebar p-4 text-sidebar-foreground">
      <Logo />
      <Link
        to="/"
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5"
      >
        <ArrowLeft className="h-3.5 w-3.5 text-primary" />
        Back to 3D Overview
      </Link>
      <Button onClick={newChat} className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-white font-semibold shadow-sm transition-all">
        <Plus className="h-4 w-4" /> New chat
      </Button>

      <div className="min-h-0 flex-1">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
          Recent conversations
        </div>
        <nav className="-mx-1 flex max-h-full flex-col gap-1 overflow-y-auto pr-1">
          {sorted.length === 0 && <p className="px-2 text-xs text-white/50">No conversations yet.</p>}
          {sorted.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center rounded-lg border transition-colors",
                t.id === activeId
                  ? "border-primary/50 bg-primary/20 text-white font-medium shadow-sm"
                  : "border-transparent text-white/70 hover:bg-white/[0.08] hover:text-white",
              )}
            >
              <Link
                to="/chat/$threadId"
                params={{ threadId: t.id }}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
              </Link>
              <button
                aria-label={`Delete ${t.title}`}
                onClick={() => {
                  threadStore.remove(t.id);
                  if (t.id === activeId) newChat();
                }}
                className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </nav>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" disabled={!threads.length}>
            <Trash2 className="h-4 w-4" /> Clear conversation history
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all conversations?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every conversation stored in this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                threadStore.clear();
                newChat();
              }}
            >
              Clear history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
