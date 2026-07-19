# PRD / Spec: Meeting Record MVP

> Synthesized from grill-with-docs + repo docs (2026-07-19).  
> Domain vocabulary: `CONTEXT.md`. ADRs 0001–0007 apply.  
> **Test seams (approved):** (1) HTTP API primary (2) Transcription pipeline port (3) LLM Gateway + Context Packer.

## Problem Statement

As an individual, I record real-world conversations (in-person meetings, not primarily conference-app system audio) and then spend too long turning messy speech into usable notes: who said what, what was decided, and what I must do next. Cloud “AI note” apps are convenient but I need something I can self-host on a small CPU-only machine (~4 cores / 4 GB RAM), control with a simple account, plug into my own OpenAI-compatible Chat Completions endpoint, and use from phone or desktop browser—with a readable UI—not a GPU research stack.

## Solution

**Meeting Record** (display name default; `APP_NAME` configurable) is a self-hosted **responsive Web App** where I:

1. Register/login (registration gated by `ALLOW_REGISTER`).
2. Configure LLM via `base_url` + `model_id` + `api_key` (env/file and/or settings UI).
3. **Click to start** in-browser mic recording, **long-press to confirm stop**, auto-upload (or import/append audio).
4. Get a **serial CPU** transcription job with **speaker labels** (FunASR-class pipeline: ASR + VAD + CAM++).
5. On transcription success, **automatically** receive structured **Minutes** (Zhizai-inspired modules; Claude visual system).
6. Read **Transcript** (play, by time / by speaker), edit, **export Markdown + PDF**.
7. Open **Q&A as a sub-page of Minutes** (bottom-right entry)—no auto “AI brain dump”.
8. Optionally open **Insights (“外脑”)** tab only after **explicit** generate—not auto after ASR.
9. Never see an **Explore** tab.

Data lives on the box: **files on disk + SQLite**. Every LLM call goes through a **Context Packer** (pinned facts full; long transcript compressed with digests + relevant full segments).

## User Stories

1. As a user, I want to register with username/email and password, so that my meetings are private to my account.
2. As a deployer, I want server-side `ALLOW_REGISTER` (env/config only, never a frontend control) to turn registration on/off, so that a public instance is not an open spam sink.
3. As a user, I want to log in and get a session/token, so that I can use the app securely.
4. As a user, I want all business APIs to reject unauthenticated calls, so that hidden URLs are not security.
5. As a user, I want resources scoped by `user_id`, so that I cannot read another user’s meetings by guessing IDs.
6. As a user, I want a settings screen for LLM `base_url`, `model_id`, and `api_key`, so that I can use my own Chat Completions endpoint without redeploying code.
7. As a deployer, I want env/config file defaults for the same three fields, so that a single-user box can boot preconfigured.
8. As a user, I want API keys masked in the UI and never logged in full, so that secrets are harder to leak.
9. As a user, I want the product title to default to “Meeting Record” and be overridable via `APP_NAME`, so that branding is flexible.
10. As a user, I want a responsive layout, so that one codebase works on phone and desktop browsers.
11. As a user, I want a home **Meeting List** of only my meetings, newest first, so that I can resume work quickly.
12. As a user, I want each list card to show title, optional summary, time, and job/minutes status, so that I know what is ready.
13. As a user, I want a prominent **Start recording** control, so that my primary capture path is one tap away.
14. As a user, I want an **Import audio** action, so that existing files still work.
15. As a user, I want tapping a card to open meeting detail, so that I can read minutes and transcript.
16. As a user, I want a “Me/Settings” entry for account, LLM config, and logout, so that configuration is discoverable.
17. As a user, I want search and tags later (P1), so that MVP stays thin.
18. As a user, I want **click to start** browser microphone capture for live in-person recording, so that I do not need a desktop system-audio helper first.
19. As a user, I want **long-press to confirm end**, so that I do not stop recording by accident.
20. As a user, I want recording to **auto-upload** after confirmed end and enqueue a Transcription Job, so that the path is zero extra steps.
21. As a user, I want pause/resume while recording (recommended P0), so that breaks do not force discard.
22. As a user, I want discard (recommended P0), so that bad takes never upload.
23. As a user, I want a large elapsed timer and simple level/waveform feedback, so that I know capture is alive.
24. As a user, I want a default **60-minute** cap (`MAX_RECORDING_MINUTES` configurable), so that memory/disk stay bounded on 4G hardware.
25. As a user, I want a default title like “New recording + timestamp” editable later, so that files are identifiable.
26. As a user, I do not need “snapshot notes / photo while recording” in MVP (P1), so that capture stays reliable.
27. As a user, I want HTTPS (or localhost) guidance for mic permission, so that capture works in real browsers.
28. As a user, I want import and **append recording** on an existing meeting (P0), so that one Meeting can grow.
29. As a user, I want Transcription Jobs to run **one at a time** on the server, so that 4G RAM is not OOM’d.
30. As a user, I want job states (queued / running / succeeded / failed / degraded), so that long CPU jobs are observable.
31. As a user, I want CPU ASR in the FunASR/SenseVoice direction, so that Chinese speech works offline of GPU clouds.
32. As a user, I want **speaker diarization as P0** via VAD + CAM++ (or equivalent in the same pipeline), so that Transcript lines show Speaker N.
33. As a user, I want timestamps on transcript segments, so that I can navigate time.
34. As a user, I want failure fallback to transcript without speakers rather than silent total failure when possible, so that I still get text.
35. As a user, I want speaker rename later (P1), so that MVP can ship Speaker 0/1 first.
36. As a user, I want **Auto Minutes**: when transcription succeeds, LLM generation of Minutes starts without an extra click, so that the happy path is complete.
37. As a user, I want manual regenerate / “change angle” later (P1 for templates), so that bad summaries are fixable.
38. As a user, I want Minutes to include a **header**: topic, time, place (optional), participants, core goal, so that notes look like real minutes.
39. As a user, I want **key topics** as numbered topics → subheads → bullets, so that structure is scannable.
40. As a user, I want **disputed points** as quote-style blocks (empty OK), so that tensions are visible.
41. As a user, I want **action items** as “owner/role + action” bullets, so that follow-ups are clear.
42. As a user, I want a **timeline recap** section when feasible (P0/P1), so that long meetings stay navigable.
43. As a user, I want diagram-style layouts as P1 only, so that MVP focuses on editable structured text.
44. As a user, I want Minutes editable, so that AI mistakes are correctable and pinned facts stay true.
45. As a user, I want detail tabs **Minutes | Transcript | Insights**, so that navigation matches the product map.
46. As a user, I want **no Explore tab**, so that scope stays disciplined.
47. As a user, I want **Q&A as a sub-page of Minutes** entered from the **bottom-right**, so that asking is available without a fourth primary tab.
48. As a user, I want Q&A answers grounded in this meeting’s transcript/minutes via Context Pack, so that answers are not generic chat.
49. As a user, I want Insights content **only after I explicitly generate**, so that tokens and noise stay under control.
50. As a user, I want Transcript playback with progress and duration (P0), so that I can re-listen.
51. As a user, I want view-by-time and view-by-speaker (P0), so that multi-speaker meetings are usable.
52. As a user, I want each line to show speaker label + time + text (P0).
53. As a user, I want speed control P0 or immediately after, so that review is faster.
54. As a user, I want click-to-seek from a line as P1, so that MVP can ship without perfect A/V sync first.
55. As a user, I want every LLM call to go through **Context Packer**, so that the model always has meeting memory.
56. As a user, I want **Pinned Facts** (header, disputes, action items, my edits, current question) always full-text in context, so that compression never drops the critical bits.
57. As a user, I want long transcripts represented by **digest + relevant full segments**, so that context limits and cost stay sane.
58. As a user, I want recent Q&A turns kept verbatim and older turns roll-summarized, so that multi-turn ask works.
59. As a user, I want transcript digests cached and invalidated when source text changes, so that packs stay coherent.
60. As a user, I want LLM access only via **OpenAI Chat Completions-compatible** HTTP, so that my existing gateway works.
61. As a user, I want export to **Markdown and PDF** (P0), so that I can archive and share files.
62. As a user, I want exports to prefer Minutes and optionally include Transcript, so that packages stay useful.
63. As a deployer, I want audio and export files on **local disk** and structured data in **SQLite**, so that a single 4C4G box is enough.
64. As a deployer, I want CPU serial workers and no default local heavy LLM process, so that ASR and RAM coexist.
65. As a user, I want the UI to follow `docs/design/DESIGN.md` (Claude warm canvas), so that reading long text stays comfortable.
66. As a user, I want Chinese-friendly font fallbacks as specified in DESIGN.md, so that CJK renders acceptably.
67. As an agent/developer, I want Slice Owner workflow on `feat/*` with human merge to main, so that delivery matches AGENTS.md.
68. As a user, I do not want MOSS/GPU pipelines, pyannote-heavy defaults, realtime caption SLAs, OAuth enterprise SSO, multi-tenant billing, or conference system-audio capture as MVP requirements, so that the product can ship on the stated hardware.

## Implementation Decisions

### Product / IA
- Display name default **Meeting Record**; `APP_NAME` configurable.
- Responsive self-hosted Web; no native dual apps in MVP.
- Home: meeting list + start record + import; settings under profile.
- Detail primary tabs: **Minutes | Transcript | Insights**; **Q&A is Minutes sub-page (bottom-right)**; **no Explore**.
- Capture: click start, long-press confirm stop, auto-upload; pause/discard recommended; default 60 min cap.
- Primary scene: **in-person mic**, not meeting-app loopback.
- Auto Minutes after successful transcription; Insights only on explicit generate.

### Architecture modules
- **TypeScript full-stack** for product code (UI, API, auth, queue orchestration, Context Packer, LLM gateway, export, SQLite). See ADR 0009.
- **Vite + React** frontend; **Hono** Node API. See ADR 0010.
- **Drizzle ORM + better-sqlite3** for SQLite. See ADR 0011.
- **pnpm** as package manager. See ADR 0012.
- **Python only when TS cannot reasonably do the job** — primarily ASR/diarization worker (FunASR-oriented SenseVoice/light ASR + fsmn-vad + cam++, `device=cpu`) as a sidecar/microservice, not a second business backend.
- Web App + Auth + LLM settings UI.
- Upload/API authenticated; resource isolation by user.
- Serial job queue for transcription (owned by TS; dispatches to Python worker).
- Context Packer (L0–L4 budget packing per ADR 0005).
- LLM Gateway: Chat Completions only; user config overrides env when set (per ADR 0006 guidance).
- Store: disk paths for media/exports; SQLite for metadata, transcript, minutes, Q&A, digests, jobs.
- Export service: Markdown + PDF.

### Test seams (approved)
1. **HTTP API** — primary product seam for external behavior.
2. **Transcription pipeline port** — audio in → speaker-aware transcript / degraded result out.
3. **LLM Gateway + Context Packer** — pack + parse behavior with mocked HTTP.

### Config surface (non-exhaustive)
- `ALLOW_REGISTER`
- `APP_NAME`
- `MAX_RECORDING_MINUTES` (default 60)
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` (or equivalent) + user settings fields
- Data directories for audio/exports; SQLite path

### Visual
- Single design source: Claude `docs/design/DESIGN.md` (ADR 0002). IA may reference Zhizai; do not copy Zhizai chrome as tokens.

### Engineering process
- ADRs 0001–0007 are binding constraints.
- Greenfield: no existing app code; implement behind the seams above.
- Progress under `docs/progress/` until `app/` exists.

## Testing Decisions

- Good tests assert **external behavior** at seams: status codes, resource isolation, job lifecycle, transcript shape (speaker/time/text), minutes required sections when model mocked, packer never dropping pinned facts under budget pressure, export files exist and contain expected headings.
- Prefer API-level tests; pipeline tests use fixture audio; LLM tests mock Chat Completions HTTP.
- Do not snapshot FunASR internals or React implementation details as primary truth.
- No production code exists yet—establish test harness with first implement slice; prior art will be created then.

## Out of Scope

- Explore tab; auto Insights/AI-brain wall after every meeting.
- GPU/MOSS default; WhisperX+pyannote as default diarization.
- Realtime live captions SLA; desktop system-audio loopback as MVP must.
- OAuth/enterprise IdP; complex RBAC; multi-tenant billing SaaS.
- Word export / rich share links as P0 (MD+PDF only).
- Cross-meeting memory (L5); heavy vector DB requirement for MVP.
- Photo-while-recording / rich in-recording annotations (P1).
- Perfect speaker real-name enrollment (P1).
- Diagram-heavy minutes as P0.

## Further Notes

- Zhizai IA notes: `docs/design/research/2026-07-19-zhizai-ui-ia-notes.md`.
- Stack decision / landscape research under `docs/design/research/`.
- Suggested vertical slices: S0b auth+settings → S1 capture+transcribe+transcript UI → S2 auto minutes+export → S3 Q&A sub-page → S4 on-demand insights (see `docs/design/slices.md`).
- Optional next: `/prototype` for recording gestures + detail tabs before heavy backend.
- Publish target: GitHub Issues with `ready-for-agent` when `gh` works; local copy always at `.scratch/meeting-record-mvp/spec.md`.
