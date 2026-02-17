---
description: Frontend development workflow for React/Vite/Tailwind UI work
---

# Frontend Workflow

Use this when working on frontend pages or components.

## Steps

### 1. Start Dev Server

```bash
cd 40_Brain/frontend
npm run dev
```

Open `http://localhost:5173` to preview.

### 2. Check Available Components

Before creating new components, check what exists:

```bash
ls frontend/src/components/ui/
ls frontend/src/components/
```

Currently available UI primitives:
- `Button` — from `@/components/ui/button`

Use Tailwind + HTML for everything else.

### 3. Add New Page

1. Create `frontend/src/pages/NewPage.tsx`
2. Add route in `frontend/src/router.tsx`
3. Add navigation in sidebar if needed

### 4. Add New Hook

1. Create `frontend/src/hooks/useNewThing.ts`
2. Handle loading, error, and data states
3. Use `fetch` with `VITE_API_URL` base

### 5. Verify

```bash
cd 40_Brain/frontend
npm run build
```

Must build without errors.

## API Connection

Backend API runs at `http://localhost:3100/api/`.

Key endpoints:
- `GET /api/projects` — List projects
- `GET /api/agents` — List agents
- `GET /api/sources` — List sources
- `POST /api/search` — Search knowledge base
- `POST /api/projects/:id/chat` — Agent chat (SSE)
