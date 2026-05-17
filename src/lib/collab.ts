/**
 * Collaborative state shapes for the shared ECCG library / notes / votes.
 * Persisted to the Drive folder via `lib/google/state.ts`.
 */

export type ReadingStatus = "to_read" | "reading" | "read";

export interface CollabLibraryItem {
  paper_id: string;
  added_by: string;       // user alias (free-text)
  added_at: string;       // ISO
  tags?: string[];
  reading_status?: ReadingStatus;
  status_updated_at?: string; // ISO of the last reading-status change
}

export interface CollabNote {
  id: string;             // uuid
  paper_id: string;
  author: string;         // alias
  body: string;
  created_at: string;
}

export interface CollabVote {
  voter: string;          // alias (used as primary key per paper)
  value: 1 | -1;
  reason?: string;
  voted_at: string;
}

export interface CollabVotesPerPaper {
  upvotes: number;
  downvotes: number;
  net: number;            // up - down
  voters: CollabVote[];
}

export interface CollabState {
  library: CollabLibraryItem[];
  notes: Record<string, CollabNote[]>;             // by paper_id
  votes: Record<string, CollabVotesPerPaper>;      // by paper_id
}

export const EMPTY_STATE: CollabState = { library: [], notes: {}, votes: {} };

const LIB_STATE = "library";
const NOTES_STATE = "notes";
const VOTES_STATE = "votes";

export async function loadCollab() {
  const { readState } = await import("./google/state");
  const {
    LibraryStateSchema,
    NotesStateSchema,
    VotesStateSchema,
    safeParseDriveState,
  } = await import("./state_schemas");
  const [libRaw, notesRaw, votesRaw] = await Promise.all([
    readState<unknown>(LIB_STATE, []),
    readState<unknown>(NOTES_STATE, {}),
    readState<unknown>(VOTES_STATE, {}),
  ]);
  const library = safeParseDriveState(LIB_STATE, libRaw, LibraryStateSchema, [])
    .value as CollabLibraryItem[];
  const notes = safeParseDriveState(NOTES_STATE, notesRaw, NotesStateSchema, {})
    .value as Record<string, CollabNote[]>;
  const votes = safeParseDriveState(VOTES_STATE, votesRaw, VotesStateSchema, {})
    .value as Record<string, CollabVotesPerPaper>;
  return { library, notes, votes };
}

export async function saveLibrary(library: CollabLibraryItem[]) {
  const { writeState } = await import("./google/state");
  await writeState(LIB_STATE, library);
}

export async function saveNotes(notes: Record<string, CollabNote[]>) {
  const { writeState } = await import("./google/state");
  await writeState(NOTES_STATE, notes);
}

export async function saveVotes(votes: Record<string, CollabVotesPerPaper>) {
  const { writeState } = await import("./google/state");
  await writeState(VOTES_STATE, votes);
}

export function recomputeVoteCounts(p: CollabVotesPerPaper): CollabVotesPerPaper {
  const upvotes = p.voters.filter((v) => v.value === 1).length;
  const downvotes = p.voters.filter((v) => v.value === -1).length;
  return { ...p, upvotes, downvotes, net: upvotes - downvotes };
}
