# Source transcript — `Delaney Dr 4.m4a`

**This document is the canonical product source-of-truth.** Every requirement in `docs/PRD-v2.md` traces back to a verbatim quote here. When the two diverge, the transcript wins.

- **Recorded:** ~40 minutes, captured 2026-05-08
- **Participants:** Rick (initiator, conceptual lead), Isaiah Dupree (engineer — *us*), Alexis (joined late, prior research experience)
- **Drive source:** [ECCG / Recordings / `Delaney Dr 4.m4a`](https://drive.google.com/drive/folders/1i0dl8vuuwv2XaAZ6bqxM2mNPvPuRDR5q) (20.8 MB, audio/mp4)
- **Whisper output:** 36,537 chars, English, 2,426 s duration
- **Ingested via:** `POST /api/meetings/ingest {"drive_file_id":"1SOfCDK31zT9SPAbxDWhuQlJY9H1i3dw6"}` (production, 117 s end-to-end)

## Decisions reached

1. **Build a research platform** — not just an index. ECCG is the first use case; architecture must generalise to other research domains.
2. **PRD format:** Google Doc in the ECCG shared folder for async collaboration, with a mirror in this repo for engineering.
3. **Cadence:** every other Friday, 6 PM Rick's time / 3 PM Isaiah's time. Next sync: **2026-05-22 18:00**.
4. **Channels:** synchronous via Google Meet, async via the shared Doc + email. Alexis is email-only (conference week).

## Action items captured

- **Rick** — create `research platform notes` Google Doc in the ECCG folder.
- **Isaiah** — build a demo. Confident in the concept.
- **Alexis** — read async, contribute when conference workload allows.

## Open questions raised

> How can we effectively categorize and rank research papers?  
> What features should the collaborative platform include?  
> How do we ensure the platform remains updated with new research?

(These are the explicit framing questions for `docs/PRD-v2.md`.)

## Raw transcript

The verbatim Whisper output is at `delaney-transcript.txt` (gitignored only by accident if removed — keep it). The key passages cited in the PRD are reproduced below by topic.

### On the problem ("research the research" cost)

> "I want to research on hammers or screwdrivers but what they are used for is just mixed in here somewhere. So to filter it further is beyond the amount of time anyone wants to spend on doing that." — **Rick**

> "There's already 4,500 links and it took a while with a lot of custom scripting in order to pull the repository information, parse through it, to dedupe similar references, to actually create this particular spreadsheet … this is not helpful. We want to learn this but to learn it we're just going to spend tremendous amounts of time. Is there a more effective way?" — **Rick**

> "It was really a quest for efficiency in my research process — to spend my time not in the research of research, but to actually spend it in studying it." — **Rick**

### On what existing tools don't do

> "Google Scholar or arXiv or other platforms — those just index. They basically just say *this exists.* It doesn't really help you do anything with it." — **Rick**

> "Out of these 4,500 articles … I can't say which is most applicable. There's no way to say *these papers are more applicable than others* to our goal." — **Rick**

> "NotebookLM is decent for summarising a collection or group of papers to get an idea, but it also misses a tremendous amount of detailed information that is incredibly relevant. Compare and contrast — that's something a lot of the LLMs don't do." — **Rick**

> "Zotero or Mendeley — they're very limiting. They're bibliography and that's it. They don't really want you doing much else with it … and very manual. You can do tagging but it's not necessarily tag-based … When you incorporate actual primary research, that system falls apart quickly." — **Rick**

> "When I do that with LLMs, I never really seem to get what I'm looking for." — **Rick**

### On the core capability list

> "Something that not just goes out and finds and fetches — web crawlers already exist. What I'm talking about is something that **identifies and says this is relevant information contextually** … and then it's **reconciled**. Is this the same published paper but just from a different source? Or is this a derivative? And then to **create relationships between papers** and **index that information** and **categorise**." — **Rick**

> "Is this event cameras specific to GPU processing? Or is GPU processing mentioned within this? Or is it applied to aerial / marine robotics? Or is it just not robotics at all? It's for autonomous vehicles, you know those kinds of things." — **Rick**

> "It would be more helpful if it was about the research with some understanding the fact that trends are starting to increase within these topics." — **Rick**

> "Event cameras that are GPU that are for aero robotics — there's clearly resource constraints there. I create that inquiry parameters and then it goes through and says here's the articles most relevant to that." — **Rick**

> "It's a meta-aggregator … pointing to where the original sources are but it doesn't necessarily have to be the original repository." — **Rick**

### On collaboration model

> "Personal libraries you can share. There's libraries that you can share with teams. It's almost like sharing bookmarks and ranking those bookmarks and having information so you can look through the summary profiles without having to dive into the resource itself." — **Rick**

> "When you have an actual team everything's duplicated … your entire personal library, if you move it over to a team, is fully duplicated. That's just inefficient." — **Rick**

> "One single resource in multiple projects, multiple discussion threads — not duplicating resources." — **Rick**

### On generalisability

> "Why limit it to event cameras? The initial need is event cameras, but the need is applicable to really any research project — business research, startup, scientific, technical, medical, life science, engineering, marketing." — **Rick**

> "Basically teams getting together, gathering information, trying to compile data, and then ranking that information." — **Rick**

### On freshness (Alexis)

> "Try to do some sort of small brain that organises that information. So instead of just gathering and trying to classify, we put something on top that's constantly being like *proofed* or *challenged* to see if that's the most current information they have." — **Alexis**

> "Duplicates are a problem because you want relevant current information, but also having duplicates or people reproducing this in an experiment will prove that something is well tested." — **Alexis**

### On what Isaiah already brings

> "[ResearchForge] is basically a set of my college courses. I have all the courses, all the calculators I made based off the homework. Articles and videos. Then I also have simulations where I scrape various different scholarly articles and try to simulate that and use those results, as well as compare research articles from another research article — see if there's any learnings found between those two." — **Isaiah**

> "I could take the idea you just mentioned and dedicate that towards event cameras … do all the same similar requirements like feature extraction from research papers, indexing and ranking and similarity search and RAG implementation if needed." — **Isaiah**

> "Within a couple weekends, I feel like it definitely did deliver something similar to help with this and help progress the research areas." — **Isaiah**
