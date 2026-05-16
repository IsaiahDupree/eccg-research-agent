"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { getIdentity } from "@/lib/identity";
import type { CollabNote } from "@/lib/collab";

interface NotesPanelProps {
  paperId: string;
}

export function NotesPanel({ paperId }: NotesPanelProps) {
  const [notes, setNotes] = useState<CollabNote[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/notes/${encodeURIComponent(paperId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) {
          setNotes(j.notes);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [paperId]);

  async function postNote() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(paperId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, author: getIdentity().alias }),
      });
      const j = await res.json();
      if (j.ok) {
        setNotes((prev) => [...prev, j.note]);
        setDraft("");
      }
    } finally {
      setPosting(false);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${encodeURIComponent(paperId)}?note_id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  const me = typeof window !== "undefined" ? getIdentity().alias : "anonymous";

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <MessageSquare className="h-4 w-4" aria-hidden /> Notes ({notes.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Team-visible notes. Signed with the alias in the header. Persisted to the
        ECCG Drive folder.
      </p>

      {loaded && notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{n.author}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                  {n.author === me && (
                    <button
                      type="button"
                      onClick={() => deleteNote(n.id)}
                      className="ml-2 inline-flex items-center text-muted-foreground hover:text-rose-600"
                      title="Delete (only your own notes)"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          postNote();
        }}
        className="mt-3 flex flex-col gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Drop a note — observations, follow-ups, links to related work…"
          rows={3}
          maxLength={4000}
          className="w-full resize-y rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            posting as <strong>{me}</strong> · max 4000 chars · {draft.length}/4000
          </span>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md border bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {posting ? "posting…" : "Post note"}
          </button>
        </div>
      </form>
    </section>
  );
}
