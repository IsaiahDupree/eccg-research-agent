/**
 * Seed-data loader for meetings. Mirrors the pattern of `seed.ts`.
 */

import seedJson from "../fixtures/seed_meetings.json" with { type: "json" };
import { fixtureMeetingDigest } from "./llm/meetings";
import type { Meeting, MeetingDigest, Paper } from "./models";
import { loadSeedPipeline } from "./seed";

export function loadSeedMeetings(): Meeting[] {
  return (seedJson as Meeting[]).map((m) => ({ ...m }));
}

export function loadSeedMeetingDigests(): MeetingDigest[] {
  const corpus: Paper[] = loadSeedPipeline().raw.papers;
  return loadSeedMeetings().map((m) => fixtureMeetingDigest(m, corpus));
}
