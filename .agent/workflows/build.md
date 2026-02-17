---
description: Build the backend and frontend applications
---

# Build Workflow

## Backend (src/)

```bash
cd 40_Brain/src
npm install
npm run build
```

Build output goes to `dist/`. Verify no errors.

## Frontend (frontend/)

```bash
cd 40_Brain/frontend
npm install
npm run build
```

Build output goes to `frontend/dist/`. Verify no errors.

## Full Build (both)

```bash
cd 40_Brain/src && npm run build && cd ../frontend && npm run build
```

## Development Mode

### Backend dev server
```bash
cd 40_Brain/src
npm run dev
```
Runs on `http://localhost:3100` by default.

### Frontend dev server
```bash
cd 40_Brain/frontend
npm run dev
```
Runs on `http://localhost:5173` by default.

## Troubleshooting

### Missing dependencies
```bash
npm install
```

### Type errors
```bash
npm run typecheck
```
Fix all type errors before building.

### Stale cache
```bash
rm -rf dist/ node_modules/.vite
npm run build
```
