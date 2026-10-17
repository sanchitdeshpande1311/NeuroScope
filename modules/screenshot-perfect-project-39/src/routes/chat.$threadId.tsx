import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChatWindow } from "@/components/neuro/ChatWindow";
import { threadStore } from "@/lib/threads";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation — NeuroScope AI Assistant" },
      { name: "description", content: "Ask NeuroScope AI about brain MRI segmentation, WT/TC/ET regions, volumes and metrics." },
      { property: "og:title", content: "Conversation — NeuroScope AI Assistant" },
      { property: "og:description", content: "Voice-enabled research assistant for the NeuroScope 3D project." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    threadStore.ensure(threadId);
    setReady(threadId);
  }, [threadId]);
  if (ready !== threadId) return <div className="h-dvh bg-background" />;
  return <ChatWindow key={threadId} threadId={threadId} />;
}
