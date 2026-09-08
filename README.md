# Document Approval Workflow

Documents move through an approval workflow that belongs to the document, not to the
system. Any number of stages, any number of approvers on each, and per-stage rules for how
many must agree and where a rejection sends it.

## Quick start

```bash
docker compose up --build
```

- Web UI — http://localhost:3000
- API — http://localhost:3001

On boot the API applies its migrations and seeds demo data (5 users, 4 documents). There is
no database to create, no `.env` to copy and no separate seed command.

There is no login. The **Acting as** dropdown in the header stands in for identity, as it did
in the starter.

## What changed from the starter

The starter's README listed its own limitations. Each one is now gone:

**Was:** three fixed stages, hardcoded as an enum.

**Now:** any number of stages, named by the document. Tested up to twenty.

---

**Was:** exactly one approver per stage, stored as three columns on the document.

**Now:** any number of approvers per stage, stored as rows, with a policy for whether one of
them is enough or all must agree.

---

**Was:** rejection always returned the document to the first stage.

**Now:** four behaviours, chosen per stage — back to the start, back one, back to a named
earlier stage, or refused outright.

---

**Was:** stages could not be edited, reordered, added or removed.

**Now:** all four, while the document is in flight, with anything already approved this round
frozen.

---

**Was:** no history — only the document's current state was stored.

**Now:** an append-only event log recording who acted, where, in which round, and what the
stage looked like at the time.

## How the approval flow works

A document owns an **ordered list of stages**. Each stage has a name, a set of approvers, a
policy, and its own reject behaviour. The document points at the stage it is waiting at;
`null` means it has finished.

**Status is one of three**, and it answers "is this document still alive?" rather than "what
just happened to it":

| Status | Meaning |

| `IN_PROGRESS` | Waiting at some stage |
| `APPROVED` | Passed the final stage. Terminal. |
| `REJECTED` | Refused outright. Terminal, cannot be resubmitted. |

**Approval policy**, per stage:

- `ANY` — one assigned approver is enough
- `ALL` — every assigned approver must approve

**Reject behaviour**, per stage:

| Behaviour | Where the document goes |
| --- | --- |
| `TO_FIRST_STAGE` | Back to the beginning — what the starter always did |
| `TO_PREVIOUS_STAGE` | Back one stage. At the first stage it stays put; the author revises in place |
| `TO_SPECIFIC_STAGE` | Back to a named earlier stage — "Legal bounces to Budget, not to square one" |
| `TERMINAL` | Refused. Status becomes `REJECTED` and no stage is current |

Only `TERMINAL` changes the status. An ordinary rejection leaves the document `IN_PROGRESS`
and moves it backwards — being sent back for changes is a normal part of a review that is
still running.

### Rounds

Rejecting increments the document's **approval round**. Approvals only count within the
current round, so a rejection resets progress **without deleting anything** — earlier
approvals stay in the history and simply belong to a past round.

The same number does a second job: a stage holding an approval in the current round is
locked against editing, so rejection releases those locks on its own. There is no unlock
endpoint and no cleanup job.

### Editing a workflow in flight

The stage list can be changed while a document is being reviewed. Stages that already hold
an approval **in the current round** are frozen — name, approvers, policy and position.
Everything ahead of the work stays editable, and the stage a document is currently waiting
at cannot be deleted.

Edits also apply forward: a stage cannot end up **behind** the point the document has
reached, whether by adding it there or by reordering an existing one into that position.
Nobody could ever approve it, so the document would finish having skipped a stage.

Edits are sent as the whole list rather than as individual operations, so a reorder either
applies completely or not at all.

### History

Every approval and rejection writes an append-only event recording who acted, on which
stage, in which round, with any comment given — **and a snapshot of the stage as it was at
that moment**: its name, policy and assigned approvers.

That snapshot is why renaming a stage today does not rewrite what someone approved last
week. Approval records are evidence; a history that silently changes is worse than none.

## Seed data

Four documents with deliberately different workflows:

| Document | Shape |
| --- | --- |
| **Q4 Vendor Contract — Southwest Builders** | Five stages. Legal Review needs **both** approvers and sends a rejection back to **Budget Review**. Executive Sign-off refuses outright. |
| **Data Retention Guidelines** | Two stages. The second needs **all three** approvers and rejects back one stage. |
| **Vendor Onboarding Policy** | The starter's original three-stage shape, still expressible. |
| **Incident Response Playbook** | Already approved — a finished document, no current stage. |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/documents` | List documents with their current stage |
| `GET` | `/documents/:id` | Document detail with full workflow |
| `GET` | `/documents/:id/history` | Append-only audit trail, oldest first |
| `POST` | `/documents` | Create a document and its stages |
| `PATCH` | `/documents/:id/stages` | Replace the workflow, respecting locked stages |
| `POST` | `/documents/:id/approve` | `{ userId, comment? }` |
| `POST` | `/documents/:id/reject` | `{ userId, comment }` — reason required |
| `GET` | `/users` | List users |

Responses: `403` when the actor is not an approver on the current stage, `409` when an edit
touches a stage locked by an approval in this round, `400` for validation failures and for
acting on a finished document, `404` for an unknown document.

## Tests

```bash
cd backend
npm install
npm test          # 20 unit tests, no database
npm run test:e2e  # 91 integration tests, needs Postgres on 5432
```

Leave `docker compose up` running for the integration suite — it uses a separate
`document_approval_test` database, created automatically, so it cannot touch the demo data.

The unit tests cover `isStageComplete()`, the pure function deciding whether a stage has the
approvals it needs. It takes plain data rather than entities, so it needs no database and
runs in under a second.

## Database

Nine migrations, sequenced expand → migrate → contract so the old code keeps working until
the new code is proven and the destructive step comes last: create the new tables, copy the
three approver columns into stage rows, add the current-stage pointer and round columns,
drop the old columns, then add a consistency trigger.

`docs/queries.sql` has reference queries: what every document is waiting on, each full
workflow with its reject routing, the complete audit trail by round, and one that returns
any event whose recorded stage name differs from what that stage is called now — the
snapshot behaviour, visible in SQL. Run it against
`postgresql://postgres:postgres@localhost:5432/document_approval` while the stack is up.

## Deliberately not built

Each of these was a scope decision rather than an oversight:

- **Reusable workflow templates.** The ask was dynamic per document, and per-document stages
  are the foundation templates sit on. Adding them is two tables plus a copy at creation —
  no rework and no data migration. A document would snapshot a template, never reference it
  live, for the same reason events snapshot their stage.
- **Workflow versioning.** The more correct answer to editing in flight, since it preserves
  both full editability and truthful history. It needs a version table and version pointers
  on every event.
- **Parallel and conditional stages**, role-based approvers, delegation, notifications.

The pattern: build the axes that change the *data model*, defer the ones that are mostly
additional surface on top of a correct model.

## Local development without Docker

```bash
# Terminal 1 — Postgres
docker compose up db

# Terminal 2 — API
cd backend && npm install && npm run start:dev

# Terminal 3 — Web
cd frontend && npm install && npm run dev
```

The API reads `backend/.env` automatically. Web on 3000, API on 3001.

## Stack

NestJS · MikroORM · PostgreSQL · Next.js App Router · React · TypeScript · Tailwind ·
Docker Compose
