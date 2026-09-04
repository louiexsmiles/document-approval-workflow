# Document Approval Workflow (Starter)

A minimal, working document approval app for a take-home coding assessment.
Candidates extend this starter — the limitations below are intentional.

## Stack

- **Backend:** NestJS, MikroORM, PostgreSQL
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Local run:** Docker Compose

## Quick start

```bash
docker compose up --build
```

Then open:

- Web UI: http://localhost:3000
- API: http://localhost:3001

On boot the API runs migrations and seeds demo data (5 users, 3 documents).

## How the approval flow works

Documents move through **three fixed stages**:

`DRAFT_REVIEW` → `LEGAL_REVIEW` → `FINAL_APPROVAL` → `APPROVED`

- Each stage has **exactly one** assigned approver (stored as columns on the document).
- At the current stage, that approver may **Approve** or **Reject**.
  - **Approve** advances to the next stage. Approving the last stage sets status to `APPROVED`.
  - **Reject** always returns the document to `DRAFT_REVIEW`, regardless of stage.
- Stages cannot be edited, reordered, added, or removed.
- There is no approval history — only the document’s current state is stored.
- There is no login. On the detail page, pick an “Acting as” user to stand in for identity.

## Seed data

| Document | Stage / Status |
| --- | --- |
| Vendor Onboarding Policy | `DRAFT_REVIEW` / `IN_PROGRESS` |
| Data Retention Guidelines | `LEGAL_REVIEW` / `IN_PROGRESS` |
| Incident Response Playbook | `FINAL_APPROVAL` / `APPROVED` |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/documents` | List documents |
| `GET` | `/documents/:id` | Document detail + approvers |
| `POST` | `/documents` | Create document |
| `POST` | `/documents/:id/approve` | `{ "userId" }` — advance stage |
| `POST` | `/documents/:id/reject` | `{ "userId" }` — back to draft review |
| `GET` | `/users` | List users |

Approve/reject return `403` if `userId` is not the current stage’s approver, and `400` if the document is already `APPROVED`.

## Local development (without Docker for apps)

```bash
# Terminal 1 — Postgres
docker compose up db

# Terminal 2 — API
cd backend
npm install
npm run start:dev

# Terminal 3 — Web
cd frontend
npm install
npm run dev
```

The API reads `backend/.env` automatically (local Postgres URL + port 3001).
Override there if needed — no env vars required on the command line.

Web: http://localhost:3000 · API: http://localhost:3001
