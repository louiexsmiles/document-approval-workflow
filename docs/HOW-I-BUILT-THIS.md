# How I Built This

The reasoning behind the dynamic approval workflow — what I planned, where that plan
changed, what I chose not to build, and how I worked.

*Louis Montes · September 2026 · Built with Claude Code*

---

## The plan before I wrote anything

I spent the first day not writing product code. I read the starter, wrote down the target
model, and made the design decisions in writing before any of them were expensive to
reverse.

The starter's README was unusually helpful, because it listed its own limitations: three
fixed stages held in an enum, exactly one approver per stage stored as three columns on the
document, rejection always returning to the first stage, no editing, and no history. That
list became my definition of done. If I could remove every item on it, I had rebuilt the
thing they asked me to rebuild.

The target model I settled on before coding:

- A document **owns** an ordered list of stages, rather than pointing at a shared definition
- Each stage carries a name, a set of approvers, a policy for how many must agree, and its
  own rule for where a rejection sends the document — the original behaviour, sending the
  whole review back to the start, is still there and is still the default. What changed is
  that you can now choose something else on top of it
- The document points at the stage it is waiting at; null means finished
- Every action writes an append-only event that can never be edited

Two things I decided early and did not revisit. The first is that completion is decided by
**one pure function** that takes plain data and touches no database, so the rules live in one
readable place and can be tested in milliseconds. The second is that history records a
**snapshot** of the stage as it was at the moment someone acted, never a live reference to it.

> That second decision is the one I would defend hardest. If an event points at the live
> stage, renaming that stage rewrites the past. For an approval system that is not a bug, it
> is a compliance failure — the same reason an invoice stores the price at time of purchase
> instead of pointing at today's price.

### The first thing I wrote was a safety net

Before touching the engine I wrote ten tests against the *existing* static behaviour — but
pinned to the guarantees rather than the shape. Not "there are three stages", but "only the
current stage's approver may act", "an approved document is terminal", "rejection returns it
to a state where someone can act".

Those are true of any approval workflow, so they survived the rewrite. I also put a single
file between the tests and the response shape. When the model changed, that one file changed
and the assertions did not. Ten tests written against three hardcoded stages still pass
against arbitrary ones.

---

## What I added past the literal ask, and why

The brief was "rebuild this workflow to be dynamic per document". Several things I built go
past that sentence. I kept a running log of each one with its justification, so the additions
would read as decisions rather than drift.

If this had been a feature handed to me on a real team, these are the items I would have
raised at stand-up to be either pulled into the sprint or written up for the next one.
Working alone off a single brief, I made the call myself and wrote down my reasoning so it
can be argued with.

| Added | Why it belongs |
| --- | --- |
| **Audit trail** | The starter recorded nothing — approve and reject mutated a column and left no trace. An approval product exists to answer *who agreed to what, and when*. Without history it only answers what is true right now, which is the smaller half. |
| **Per-stage reject routing** | "All the ways a customer might need to adjust how a document goes through a workflow" covers where a rejection lands. "Legal sends it back to Budget, but the CFO refuses outright" is an ordinary pattern. Cost: one enum column. |
| **A `REJECTED` status** | With only in-progress and approved, a document that has been definitively refused sits in progress forever. That is the status field misreporting reality, and it separates *send back for revision* from *refuse outright* — two things the word "reject" was conflating. |
| **Round counter** | A rejection has to stop earlier approvals counting. The obvious way compares timestamps, but those come from the API process and two servers with drifting clocks can order events wrongly — silently discarding a valid approval. An integer removes the dependency on clocks entirely. |
| **Row locking** | The original could not have a concurrency problem: one approver per stage meant one possible actor. Allowing several approvers removes that guarantee. Introduced by the feature, so handled with it. |
| **A database consistency trigger** | Status and current-stage encode one fact between them and nothing enforced they agree. |

**That last one paid for itself immediately.** Building the guard found two defects nobody
knew about: every document was committing in an invalid state on creation, and deleting the
stage a document was waiting at stranded it silently. Neither was found by looking for bugs.
Both were found by trying to write down a rule the system was supposed to already obey.

### What I deliberately did not build

Reusable workflow templates, workflow versioning, parallel and conditional stages,
role-based approvers, delegation, notifications. Each is a scope decision with a cost I can
state.

Templates are the one I expect to be asked about. The ask was dynamic *per document*, and
per-document stages are the foundation templates sit on rather than a lesser version of them.
Adding them later is two tables and a copy step at creation — no rework, no data migration.
The expensive part is the management UI, which is not what this exercise tests.

Versioning is the more interesting cut. It is the genuinely correct answer to editing a
workflow that is already in flight, because it preserves both full editability and truthful
history. It needs a version table and version pointers on every event. I chose event
snapshots plus a lock on approved stages instead, which covers the same failure at a fraction
of the cost — and I would take it to versioning in production.

---

## Using AI as a working colleague

You said to use AI as I would if I were an engineer on the team, so I did. I used **Claude
Code** throughout, and I set it up the way I would want a teammate set up: with written
rules, a decision log, and a ticket board it had to work through.

I kept a private working directory alongside the repo — never committed, and not part of this
submission — holding the operating rules, the decision records, the ticket board, an
edge-case register, and a knowledge file that grew as we hit things the hard way. That
directory is why the work stayed coherent across three working days rather than becoming a
pile of plausible code — Friday, then Monday and Tuesday, with the delivery pulled forward a
day partway through.

```
WORKING FILES  (not shipped)          WHAT EACH ONE PRODUCED IN THE REPO
─────────────────────────────         ──────────────────────────────────
RULES.md          ───────────────▶    every commit, reviewed before it landed
  how the work gets done

DECISIONS.md      ───────────────▶    the shape of the schema and the engine
  12 decision records

TICKETS.md        ───────────────▶    27 commits, each naming its ticket
  49 tickets

EDGE-CASES.md     ───────────────▶    guards, and one bug found on the last day
  ~50 cases, each resolved

knowledge/        ───────────────▶    fewer repeated mistakes
  things learned the hard way
```

Those working files are not in this repository — they are how I worked, not what I built. I
have described them here because the process is part of what you asked to see.

### The rules mattered more than I expected

I wrote an operating agreement on day one and it shaped the output repeatedly. A few that
earned their place:

- **I never handed over a commit I had not read.** Every change came with a written summary
  of what moved and why before I committed it. A commit I cannot explain is a liability, not
  progress.
- **A decision gets written down before it gets built**, not after. Twelve decision records
  exist because of this, and several changed shape while being written — which is cheaper
  than changing shape after the migration.
- **Comments explain why, never what.** When one drifted into narrating an approach I had
  already abandoned, it got cut — a comment that misdescribes the code is worse than none.
- **Boring and explainable beats clever.** An ordered list with a policy enum does the job; a
  generic rules engine would not have been readable in one sitting.
- **Watch every guard fail before trusting it.** This one saved me three times.

### Where it actually saved time

The honest answer is not "it wrote the code faster". It is that I could run two tracks at
once. On the final evening I had the full integration suite running a hundred consecutive
times in the background — hunting an intermittent failure — while I worked through the
interface by hand at the front. Neither blocked the other. Alone, I would have picked one.

The same pattern appeared throughout: mutation-testing the suite while I reviewed
documentation, replaying migrations while I clicked through the app. The leverage was in
parallelism and in never losing the thread, not in typing speed.

**What I did not delegate.** The scoping, the design decisions, and the call on what not to
build. Every decision record was argued through before code existed, and I reviewed the
complete diff myself before submitting. Nothing shipped that I cannot explain unprompted —
which is what this document is for.

---

## Three things found by looking twice

The most useful habit I kept was distrusting a green test suite. Three times a test passed
while proving nothing, and each time the fix was to break the thing it protected and check it
went red.

Late on the final day I went further and mutation-tested the whole suite — breaking each
guarantee in the production code one at a time to see whether any test noticed. Eleven
mutations, nine caught. The two that were not are the interesting ones.

One was a test named for the row lock that *took the lock itself* in the test body. It proved
PostgreSQL works, which was never in doubt, and never touched my service — deleting the lock
from the code left all 86 tests green. I replaced it with one that asserts the SQL the
service actually emits, because a single process cannot contend with itself and there is no
behavioural way to observe it.

**And one bug came directly from a note I wrote on day one.** While designing the editing
rules I recorded a case I could not yet handle — inserting a stage behind the point a
document had already reached, where nobody could ever approve it — and marked it "leaning:
block, revisit when the endpoint exists". You cannot fix something that has not been written
yet, so I wrote the core first and left the note.

Re-reading that register on the last day found the case still open, and the API still
accepted it. A document could finish having silently skipped a stage. Fixing it exposed a
second route to the same outcome — reordering an existing stage rather than adding a new one
— which only appears after a rejection, when nothing is locked. Both are closed and both are
tested.

Nothing in my test suite would have found that. It came from having written the concern down
at the moment I noticed it, and from going back to read what I had written.

### And one I got wrong twice before getting it right

On the last evening I found that renaming a stage saved correctly but the panel beside the
editor kept showing the old name until you navigated away. The data was never wrong — the
database, the API and the history all had the change. Purely cosmetic.

My first fix made the panel update and introduced a far worse failure: the editor could hang
with the save button spinning indefinitely. My second failed silently in a way I would not
have caught without instrumentation. Only when I stopped reasoning about React and watched
the network did it become obvious — the refresh request fires and the server answers, and
closing the editor in the same update discards the result before it lands.

**The reason I am including this.** Both bad fixes passed the check I had given them — I
confirmed each one solved the original symptom and shipped. Neither time did I ask what new
failure I might have created. The third attempt worked because I got evidence first instead
of a theory. And I kept the version that is slightly less elegant, because the tidier one
demonstrably did not work.

---

## How the work was broken up

Forty-nine tickets across six phases. Every feature and fix commit names the ticket it
belongs to, so the history reads as a sequence of decisions rather than a series of saves.

| 49 | 27 | 116 | 9 | 12 |
| --- | --- | --- | --- | --- |
| Tickets | Commits | Tests | Migrations | Decisions |

The phases run design → schema → engine → interface → verification. That order is deliberate:
the schema decisions are the expensive ones to reverse, so they came after the design was
written down and before anything depended on them.

**Some tickets were combined at commit time and some were split.** The schema tickets landed
together because three entities and their migration are one reviewable idea — splitting them
would produce commits that do not compile. The stage-editing endpoint went the other way and
split into four, because the deferrable-uniqueness migration and the event snapshot each
stand on their own and each needed its own explanation. I let the commit boundary follow what
a reviewer would want to read in one sitting, not the ticket boundary.

Work was separated into **backend**, **frontend** and **verification** tracks. The backend
finished first because the interface has nothing to render until the model is real, and
verification was continuous rather than a phase at the end — the invariant tests existed
before the rewrite started.

### Everything on the board

**Foundation**

| ID | Ticket | |
| --- | --- | --- |
| T-01 | Working files: rules, tickets, architecture, decisions, edge cases | shipped |
| T-02 | Commit the pristine starter as a baseline, work on a branch | shipped |
| T-03 | Add the Jest harness the starter had stripped out | shipped |
| T-04 | Invariant tests against the old behaviour — the safety net | shipped |

**Design**

| ID | Ticket | |
| --- | --- | --- |
| T-05 | Lock scope; write the target model | shipped |
| T-06 | Decision: per-document stages now, templates deferred | shipped |
| T-07 | Decision: snapshot, never a live reference | shipped |
| T-08 | Decision: approved stages are immutable | shipped |
| T-09 | Decision: reject behaviour, reset semantics, required reason | shipped |

**Schema**

| ID | Ticket | |
| --- | --- | --- |
| T-10 | Stage and approver entities, policy and reject enums | shipped |
| T-11 | Append-only approval event entity | shipped |
| T-12 | Migration: create the new tables (additive only) | shipped |
| T-13 | Data migration: approver columns into stage rows | shipped |
| T-13b | Schema-drift and constraint tests | shipped |
| T-14 | Migration: drop the old columns (the destructive step, last) | shipped |
| T-16b | Migration: current-stage pointer and round columns | shipped |

**Engine**

| ID | Ticket | |
| --- | --- | --- |
| T-16 | Pure stage-completion evaluator plus unit tests | shipped |
| T-17 | Rewrite approve around the evaluator | shipped |
| T-18 | Rewrite reject: per-stage target, approval reset | shipped |
| T-18b | Terminal rejection and the rejected status | shipped |
| T-19 | Rewrite create to accept a dynamic stage definition | shipped |
| T-20 | New request validation for dynamic stages | shipped |
| T-21 | Stage-editing endpoint with the immutability lock | shipped |
| T-21b | Quiet the test output; gate the ORM logger | shipped |
| T-21c | Migration: deferrable positions so reorders survive | shipped |
| T-21d | Record the stage as it was at action time | shipped |
| T-22 | History endpoint | shipped |

**Interface**

| ID | Ticket | |
| --- | --- | --- |
| T-27 | Retype the API client for the dynamic model | shipped |
| T-28 | Detail page: dynamic stage list with approvers and policy | shipped |
| T-29 | History timeline grouped by round, reading the snapshot | shipped |
| T-30 | Stage builder: add, remove, reorder, multiple approvers | shipped |
| T-31 | Stage editor on a live document, respecting the lock | shipped |
| T-43 | Expose per-stage reject behaviour; seed an example of it | shipped |

**Verification**

| ID | Ticket | |
| --- | --- | --- |
| T-33 | Integration suite: flows, reject targets, rounds, seed, errors | shipped |
| T-40 | Mutation audit; close the two guarantees nothing defended | shipped |
| T-34 | Edge-case pass — found the stranded-stage bug | shipped |
| T-35 | Rewrite the README; repair the reference queries | shipped |
| T-36 | Fresh-clone verification from scratch | shipped |
| T-42 | Diagnose and fix the intermittent test failure | shipped |

**Deferred**

| ID | Ticket | |
| --- | --- | --- |
| T-15 | Workflow template entities | next |
| T-23 | Template endpoints and create-from-template | next |
| T-32 | Template management UI | next |
| T-24 | Quorum-of-K approval policy | later |
| T-25 | Optional and skippable stages | later |
| T-26 | Self-approval prevention (needs an author on the document) | later |
| T-39 | Drag-and-drop reordering — buttons work and are keyboard-accessible | cut |
| T-41 | Unit tests for the form's pure helpers | cut |

The deferred rows are not a wish list. **Next** means I would start there on Monday and the
schema already accommodates it. **Later** means it is real work with a real design question
attached. **Cut** means I decided the cost was not worth it and I can defend that —
drag-and-drop is presentation on top of reordering that already works and is
keyboard-accessible, and the form helpers are covered indirectly through the API suite.

---

## What I would have done differently on a team

Almost all of it the same, with one difference: I would have asked. Several of the calls in
here — how far to take rejection routing, whether editing a live workflow is in scope at all,
whether history deserved a table on day one — are exactly the questions I would have raised at
stand-up and let the room settle in two minutes.

Working from a single brief, I made those calls myself and wrote down the reasoning so they
can be argued with rather than guessed at. If any of them are wrong, the record of why is
there, and most of them are cheap to reverse because the decision was made before the schema
depended on it.

> The thing I would most want you to take from this: I treated an exercise with no real data
> as though the data were real. The migrations are sequenced so the old code keeps working
> until the new code is proven and the destructive step comes last. I verified the data
> migration by running the same query against the old columns and the new tables and comparing
> them row by row. None of that was necessary here. It is how I would want it done if it
> mattered.

The repository carries the full history, one commit per decision. This document, the README,
and the code are meant to be read together — and I am looking forward to walking through any
part of it.
