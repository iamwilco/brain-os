---
name: frontend-patterns
description: Frontend development patterns for the Brain React app. Use when building or modifying UI components.
---

# Frontend Patterns Skill

## Stack

- **React 18** with TypeScript
- **Vite** for bundling
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Router** for navigation
- **React Query** for data fetching (where applicable)

## Component Structure

```
frontend/src/
├── components/        # Reusable UI components
│   ├── ui/           # Primitive components (Button, etc.)
│   ├── Dashboard/    # Feature-specific components
│   └── Layout/       # Layout components
├── hooks/            # Custom React hooks
├── pages/            # Route-level page components
├── stores/           # Zustand stores
├── lib/              # Utilities
└── router.tsx        # Route definitions
```

## Patterns

### Pages
- One page per route in `pages/`
- Pages fetch data via hooks, render components
- Use loading/error/empty states

### Hooks
- Prefix with `use`: `useAgents`, `useProjects`
- Handle loading, error, and data states
- Encapsulate API calls

### Styling
- Tailwind utility classes, no custom CSS
- Dark mode: use Tailwind dark: prefix
- Responsive: mobile-first with `sm:`, `md:`, `lg:`

### State
- Zustand for global state (app, events)
- React state for local component state
- Avoid prop drilling beyond 2 levels

## API Integration

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3100';

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

## Adding a New Page

1. Create `pages/NewPage.tsx`
2. Add route in `router.tsx`
3. Add nav link in `Layout/Sidebar.tsx`
4. Create any needed hooks in `hooks/`
