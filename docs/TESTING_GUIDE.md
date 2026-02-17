# Brain System — Step-by-Step Testing Guide

> A comprehensive guide to test every feature of the Wilco OS Brain system.

---

## Prerequisites

Before testing, ensure:

1. **Environment Setup**
   ```bash
   # Check .env file exists with required variables
   cat 40_Brain/src/.env
   ```
   
   Required:
   ```
   BRAIN_VAULT_PATH=/Users/New/Desktop/Wilco OS
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **Dependencies Installed**
   ```bash
   cd "40_Brain/src"
   npm install
   
   cd "../frontend"
   npm install
   ```

3. **Build Success**
   ```bash
   cd "40_Brain/src"
   npm run build
   
   cd "../frontend"
   npm run build
   ```

---

## Test 1: Server Startup

### 1.1 Start Backend Server

```bash
cd "40_Brain/src"
npm run dev
```

**Expected:**
- Server starts on port 3001
- No errors in console
- Message: "Server listening on http://localhost:3001"

### 1.2 Health Check

```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### 1.3 Start Frontend

```bash
cd "40_Brain/frontend"
npm run dev
```

**Expected:**
- Vite dev server starts on port 5173
- Open http://localhost:5173 in browser
- Dashboard loads without errors

---

## Test 2: Projects

### 2.1 View Projects List

1. Navigate to http://localhost:5173/projects
2. **Expected:** Projects page loads
3. **Verify:** List shows existing projects (or empty state)

### 2.2 Create New Project

1. Click "New Project" button
2. Fill in:
   - **Name:** "Test Project"
   - **Emoji:** 🧪
   - **Description:** "A test project for validation"
3. Click "Create"

**Expected:**
- Project created successfully
- Redirected to project detail page
- Project folder created at `30_Projects/Test Project/`

### 2.3 View Project Detail

1. Click on the created project
2. **Verify all tabs load:**
   - [ ] Overview tab shows stats
   - [ ] Knowledge tab shows upload zone
   - [ ] Sources tab shows linked scopes
   - [ ] Chat tab shows chat interface
   - [ ] Agent tab shows agent status
   - [ ] Tasks tab loads

### 2.4 Update Project

1. Edit project description
2. Change status to "paused"
3. Save changes

**Expected:** Changes persist after page refresh

### 2.5 Delete Project

1. Delete the test project
2. **Expected:** Project removed from list
3. **Note:** Project folder remains in vault (manual cleanup)

---

## Test 3: File Upload

### 3.1 Prepare Test Files

Create test files:

```bash
# Create test markdown file
echo "# Test Document

## Overview
This is a test document for extraction.

## Tasks
- [ ] TODO: Complete the test
- [ ] TASK: Verify extraction works

## Decisions
DECISION: We will use pattern-based extraction for v1.

## Notes
NOTE: This is an important note about the system.

## Entities
The Brain System uses SQLite and Fastify for the backend.
" > /tmp/test-document.md

# Create test text file
echo "This is a plain text file for testing.
CLAIM: The extraction system supports multiple file types.
" > /tmp/test-notes.txt
```

### 3.2 Upload via UI

1. Navigate to project's Knowledge tab
2. Drag and drop the test files into the upload zone
3. **Or** click to browse and select files

**Expected:**
- Progress indicator shows upload progress
- Success message with uploaded file count
- Files appear in project folder

### 3.3 Verify Upload

```bash
ls -la "30_Projects/Test Project/"
```

**Expected:** See uploaded files in project folder

### 3.4 Test Invalid File Type

1. Try to upload a `.exe` or `.zip` file

**Expected:** Error message - file type not allowed

---

## Test 4: Knowledge Extraction

### 4.1 Trigger Extraction

1. In Knowledge tab, click "Extract" button
2. **Expected:** 
   - Button shows "Extracting..." with spinner
   - After completion, shows success message:
     - Files scanned count
     - Items extracted count
     - Total items count

### 4.2 View Extracted Items

1. Knowledge items should now appear in the list
2. **Verify item types extracted:**
   - [ ] Tasks (from `TODO:`, `TASK:`, `- [ ]`)
   - [ ] Decisions (from `DECISION:`)
   - [ ] Notes (from headers like `## Overview`)
   - [ ] Claims (from `CLAIM:`, `NOTE:`)

### 4.3 Test Filtering

1. Use type filter dropdown
2. Select "Task"
3. **Expected:** Only task items shown

4. Select "Decision"
5. **Expected:** Only decision items shown

### 4.4 Test Search

1. Type "extraction" in search box
2. **Expected:** Only items containing "extraction" shown

### 4.5 View Source Citation

1. Click on an item to expand
2. **Expected:**
   - Content preview
   - Source file path
   - Line number
   - Extraction timestamp

### 4.6 Verify items.json

```bash
cat "30_Projects/Test Project/items.json" | head -50
```

**Expected:** JSON array of extracted items with proper structure

---

## Test 5: Project Agent

### 5.1 Create Agent

1. Go to Agent tab
2. Click "Create Agent"

**Expected:**
- Agent created successfully
- AGENT.md file created at `30_Projects/Test Project/agent/AGENT.md`
- MEMORY.md file created

### 5.2 Verify Agent Files

```bash
cat "30_Projects/Test Project/agent/AGENT.md"
```

**Expected:** Valid YAML frontmatter with agent config

### 5.3 Chat with Agent

1. Go to Chat tab
2. Type a message: "What is this project about?"
3. Send message

**Expected:**
- Loading indicator during response
- AI response appears
- Response is contextual to project

### 5.4 Test Memory Save

1. After chatting, click "Save to Memory"
2. **Expected:** Success message

3. Verify:
```bash
cat "30_Projects/Test Project/agent/MEMORY.md"
```

**Expected:** Session summary saved to memory file

---

## Test 6: Agents Page

### 6.1 List Agents

1. Navigate to http://localhost:5173/agents
2. **Expected:** List of all agents

### 6.2 View Agent Detail

1. Click on an agent
2. **Expected:** Agent detail page with:
   - Config tab (AGENT.md editor)
   - Memory tab (MEMORY.md editor)

### 6.3 Edit Agent Config

1. Make a small edit to AGENT.md
2. Save changes

**Expected:** Changes saved and persisted

### 6.4 Edit Agent Memory

1. Add a note to MEMORY.md
2. Save changes

**Expected:** Changes saved and persisted

---

## Test 7: Sources

### 7.1 List Sources

1. Navigate to http://localhost:5173/sources
2. **Expected:** List of source collections (may be empty)

### 7.2 View Source Detail

1. If sources exist, click to view detail
2. **Expected:** 
   - Collection metadata
   - Counts (conversations, messages, items)

---

## Test 8: Search

### 8.1 API Search Test

```bash
curl "http://localhost:3001/search?query=test&limit=10"
```

**Expected:** JSON response with search results

### 8.2 Verify Search Response Structure

```json
{
  "results": [...],
  "total": <number>,
  "took": <milliseconds>
}
```

---

## Test 9: API Endpoints

### 9.1 Projects API

```bash
# List projects
curl http://localhost:3001/projects

# Get single project (replace ID)
curl http://localhost:3001/projects/<project-id>

# Create project
curl -X POST http://localhost:3001/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"API Test","rootPath":"30_Projects/API Test"}'

# Get knowledge items
curl "http://localhost:3001/projects/<id>/knowledge?type=task"
```

### 9.2 Agents API

```bash
# List agents
curl http://localhost:3001/agents

# Get single agent (replace ID)
curl http://localhost:3001/agents/<agent-id>

# Get agent config
curl http://localhost:3001/agents/<agent-id>/config

# Get agent memory
curl http://localhost:3001/agents/<agent-id>/memory
```

### 9.3 Sources API

```bash
# List sources
curl http://localhost:3001/sources
```

---

## Test 10: CLI Commands

### 10.1 Help

```bash
cd "40_Brain/src"
npm run cli -- --help
```

**Expected:** List of available commands

### 10.2 Index Command

```bash
npm run cli -- index --vault "/Users/New/Desktop/Wilco OS"
```

**Expected:**
- Scanning progress
- Index complete message
- Stats: files scanned, indexed, chunks created

### 10.3 Extract Command

```bash
npm run cli -- extract --vault "/Users/New/Desktop/Wilco OS" --limit 10
```

**Expected:**
- Extraction progress
- Stats: sources processed, items created

### 10.4 Synth Command

```bash
npm run cli -- synth weekly --vault "/Users/New/Desktop/Wilco OS"
```

**Expected:**
- Section update progress
- Status snapshot generated
- Changelog generated

### 10.5 Export Command

```bash
npm run cli -- export context-pack \
  --vault "/Users/New/Desktop/Wilco OS" \
  --to "/tmp/brain-export" \
  --scope "path:30_Projects/*"
```

**Expected:**
- Export progress
- Files created in output directory
- manifest.json and README.md generated

---

## Test 11: Error Handling

### 11.1 Invalid Project ID

```bash
curl http://localhost:3001/projects/invalid-id-12345
```

**Expected:** 404 error with message "Project not found"

### 11.2 Invalid Request Body

```bash
curl -X POST http://localhost:3001/projects \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}'
```

**Expected:** 400 error with validation message

### 11.3 Server Not Running

1. Stop the backend server
2. Try to load frontend

**Expected:** Error message indicating API unavailable

---

## Test 12: Edge Cases

### 12.1 Empty Project

1. Create project with no files
2. Try extraction

**Expected:** Success with 0 items extracted

### 12.2 Large File Upload

1. Create a large file (>10MB)
2. Try to upload

**Expected:** Either succeeds or shows appropriate error (50MB limit)

### 12.3 Special Characters

1. Create project with special characters in name: "Test & Project (2026)"
2. **Expected:** Handles gracefully

### 12.4 Concurrent Requests

1. Send multiple chat messages quickly
2. **Expected:** All handled without errors

---

## Test Checklist Summary

### Core Functionality
- [ ] Server starts and health check passes
- [ ] Frontend loads without errors
- [ ] Projects CRUD works
- [ ] File upload works
- [ ] Knowledge extraction works
- [ ] Knowledge filtering/search works
- [ ] Agent creation works
- [ ] Agent chat works
- [ ] Memory save works
- [ ] Sources page loads
- [ ] Search API works

### CLI Commands
- [ ] `brain index` works
- [ ] `brain extract` works
- [ ] `brain synth weekly` works
- [ ] `brain export context-pack` works

### Error Handling
- [ ] Invalid IDs return 404
- [ ] Invalid data returns 400
- [ ] Graceful degradation when server down

---

## Troubleshooting

### Server Won't Start

1. Check `.env` file exists and is correct
2. Verify port 3001 is not in use: `lsof -i :3001`
3. Check for build errors: `npm run build`

### Database Errors

1. Delete and recreate: `rm 40_Brain/src/brain.db`
2. Restart server (will auto-create)

### Frontend Build Errors

1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear Vite cache: `rm -rf .vite`

### Chat Not Working

1. Verify `ANTHROPIC_API_KEY` is set
2. Check API key is valid
3. Check console for rate limit errors

### Extraction Returns No Items

1. Verify files contain extractable patterns
2. Check file extensions are supported
3. Review items.json for raw output

---

## Test 13: Agent Scope Enforcement

### 13.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/agent/scope.test.ts
```

**Expected:** All tests pass

### 13.2 Scope Matching

Test the scope matching logic programmatically:

```typescript
import { matchesScope, ScopeConfig } from './src/agent/scope.js';

const scope: ScopeConfig = {
  allowedPaths: ['30_Projects/Brain/**'],
  deniedPaths: ['**/*.secret'],
  maxDepth: 5,
};

// Should match
console.log(matchesScope('30_Projects/Brain/README.md', scope)); // true

// Should not match (denied)
console.log(matchesScope('30_Projects/Brain/config.secret', scope)); // false

// Should not match (outside scope)
console.log(matchesScope('40_Brain/src/index.ts', scope)); // false
```

### 13.3 Verify Violation Logging

```typescript
import { createScopeEnforcer } from './src/agent/scope.js';

const enforcer = createScopeEnforcer({
  allowedPaths: ['30_Projects/**'],
  deniedPaths: [],
  maxDepth: 3,
});

// Attempt violation
enforcer.checkAccess('70_Sources/secret.md', 'read');

// Check violations
const violations = enforcer.getViolations();
console.log(violations); // Should contain the violation
```

---

## Test 14: Subagent Spawning

### 14.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/agent/subagent.test.ts
```

**Expected:** All tests pass

### 14.2 Skill Registry

```typescript
import { createSkillRegistry } from './src/agent/subagent.js';

const registry = createSkillRegistry();

// Register a skill
registry.register({
  id: 'test-skill',
  name: 'Test Skill',
  description: 'A test skill',
  version: '1.0.0',
  capabilities: ['test'],
  configPath: '40_Brain/agents/skills/test/AGENT.md',
});

// List skills
console.log(registry.list()); // Should show test-skill

// Find by capability
console.log(registry.findByCapability('test')); // Should find test-skill
```

### 14.3 Spawn Allowlist

```typescript
import { createSpawnManager } from './src/agent/subagent.js';

const manager = createSpawnManager({
  allowlist: {
    'admin': ['*'],           // Admin can spawn any
    'project-agent': ['seo', 'writing'], // Limited skills
  },
  maxConcurrent: 5,
  timeout: 30000,
});

// Check if spawn allowed
console.log(manager.canSpawn('admin', 'any-skill')); // true
console.log(manager.canSpawn('project-agent', 'seo')); // true
console.log(manager.canSpawn('project-agent', 'code')); // false
```

---

## Test 15: Agent Scheduler

### 15.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/agent/scheduler.test.ts
```

**Expected:** All tests pass

### 15.2 Schedule Management

```typescript
import { createAgentScheduler } from './src/agent/scheduler.js';

const scheduler = createAgentScheduler();

// Schedule an agent run
const scheduleId = scheduler.schedule({
  agentId: 'admin',
  cron: '0 9 * * *', // Daily at 9am
  task: 'daily-summary',
  enabled: true,
});

// List schedules
console.log(scheduler.list()); // Should show the schedule

// Get next run time
console.log(scheduler.getNextRun(scheduleId));

// Pause schedule
scheduler.pause(scheduleId);
console.log(scheduler.get(scheduleId).enabled); // false

// Resume
scheduler.resume(scheduleId);
```

### 15.3 Run History

```typescript
// After some runs...
const history = scheduler.getHistory(scheduleId, { limit: 10 });
console.log(history);
// Should show: { runId, startTime, endTime, status, result }
```

---

## Test 16: Triggered Behaviors

### 16.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/agent/triggers.test.ts
```

**Expected:** All tests pass

### 16.2 Trigger Registration

```typescript
import { createTriggerManager, TriggerEvents } from './src/agent/triggers.js';

const manager = createTriggerManager();

// Register a trigger
const triggerId = manager.register({
  id: 'on-upload',
  event: TriggerEvents.FILE_UPLOADED,
  agentId: 'admin',
  filter: { pathPattern: '30_Projects/**' },
  enabled: true,
});

// List triggers
console.log(manager.list()); // Should show on-upload trigger
```

### 16.3 Fire Events

```typescript
// Fire an event
const results = await manager.fireEvent({
  type: TriggerEvents.FILE_UPLOADED,
  payload: {
    path: '30_Projects/Brain/new-file.md',
    size: 1024,
  },
  timestamp: Date.now(),
});

console.log(results); // Should show triggered agent results

// Check stats
console.log(manager.getStats());
// { totalFired, successCount, failureCount, lastFired }
```

---

## Test 17: Self-Correction & Retry

### 17.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/agent/retry.test.ts
```

**Expected:** All tests pass

### 17.2 Retry Manager

```typescript
import { createRetryManager, withRetry } from './src/agent/retry.js';

const manager = createRetryManager({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
});

// Execute with retry
const result = await manager.executeWithRetry(
  'test-operation',
  async () => {
    // Simulated operation that might fail
    if (Math.random() < 0.5) throw new Error('Random failure');
    return 'success';
  }
);

console.log(result);

// Check stats
console.log(manager.getStats());
// { totalOperations, successCount, retryCount, escalationCount }
```

### 17.3 Exponential Backoff

```typescript
import { calculateBackoffDelay } from './src/agent/retry.js';

// Test backoff calculation
console.log(calculateBackoffDelay(0, { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 30000 })); // ~1000ms
console.log(calculateBackoffDelay(1, { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 30000 })); // ~2000ms
console.log(calculateBackoffDelay(2, { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 30000 })); // ~4000ms
console.log(calculateBackoffDelay(5, { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 30000 })); // capped at 30000ms
```

### 17.4 Escalation Handler

```typescript
manager.setEscalationHandler(async (operation, error, context) => {
  console.log(`ESCALATION: ${operation} failed after ${context.attempts} attempts`);
  console.log(`Error: ${error.message}`);
  // In production: send notification, create ticket, etc.
});
```

---

## Test 18: Vector Search

### 18.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/search/vector.test.ts
```

**Expected:** All 19 tests pass

### 18.2 Vector Store

```typescript
import { createVectorStore, MockEmbeddingProvider } from './src/search/vector.js';
import { getDatabase } from './src/db/connection.js';

const db = getDatabase();
const store = createVectorStore(db, new MockEmbeddingProvider());
store.initTables();

// Index content
await store.indexChunk(1, 'Machine learning algorithms for NLP');
await store.indexChunk(2, 'Cooking recipes for Italian pasta');
await store.indexMemory('admin', 'preferences', 'User prefers dark mode');

// Search
const results = await store.searchChunks('machine learning', { 
  minSimilarity: 0.5,
  limit: 10 
});
console.log(results);

// Get stats
console.log(store.getStats());
// { chunkEmbeddings, itemEmbeddings, memoryEmbeddings }
```

### 18.3 Cosine Similarity

```typescript
import { cosineSimilarity, normalizeVector } from './src/search/vector.js';

const a = [1, 0, 0];
const b = [1, 0, 0];
console.log(cosineSimilarity(a, b)); // 1.0 (identical)

const c = [1, 0, 0];
const d = [0, 1, 0];
console.log(cosineSimilarity(c, d)); // 0.0 (orthogonal)

const e = [3, 4];
console.log(normalizeVector(e)); // [0.6, 0.8] (unit length)
```

---

## Test 19: Hybrid Search

### 19.1 Unit Tests

```bash
cd "40_Brain/src"
npm test -- src/search/hybrid.test.ts
```

**Expected:** All 7 tests pass

### 19.2 Hybrid Search Engine

```typescript
import { createHybridSearchEngine } from './src/search/hybrid.js';
import { createVectorStore } from './src/search/vector.js';
import { getDatabase } from './src/db/connection.js';

const db = getDatabase();
const vectorStore = createVectorStore(db);
vectorStore.initTables();

const engine = createHybridSearchEngine(db, vectorStore);

// Search with combined FTS + vector scoring
const results = await engine.search('machine learning', {
  ftsWeight: 0.4,
  vectorWeight: 0.6,
  limit: 20,
  minSimilarity: 0.3,
});

console.log(results);
// Each result has: ftsScore, vectorScore, combinedScore
```

### 19.3 Weight Configuration

```typescript
// FTS-heavy search (keyword matching priority)
const ftsResults = await engine.searchChunks('exact phrase', {
  ftsWeight: 0.8,
  vectorWeight: 0.2,
});

// Vector-heavy search (semantic similarity priority)
const semanticResults = await engine.searchChunks('similar concepts', {
  ftsWeight: 0.2,
  vectorWeight: 0.8,
});
```

---

## Test 20: Autonomy Dashboard (Frontend)

### 20.1 Navigate to Dashboard

1. Start frontend: `cd 40_Brain/frontend && npm run dev`
2. Navigate to http://localhost:5173/autonomy

**Expected:** Dashboard loads with 4 tabs

### 20.2 Verify Tabs

- [ ] **Schedules Tab**: Shows list of scheduled agent runs
- [ ] **Triggers Tab**: Shows trigger history
- [ ] **Health Tab**: Shows agent health status with success rates
- [ ] **Errors Tab**: Shows error log with escalation badges

### 20.3 Stats Cards

Verify the 4 stat cards at the top:
- [ ] Active Schedules count
- [ ] Triggers Today count
- [ ] Healthy Agents count
- [ ] Errors count

### 20.4 Refresh Button

1. Click "Refresh" button
2. **Expected:** Data reloads (mock data in current implementation)

---

## Test 21: Run All Tests

### 21.1 Full Test Suite

```bash
cd "40_Brain/src"
npm test
```

**Expected:** All tests pass

### 21.2 Test Coverage

```bash
npm test -- --coverage
```

**Expected:** Coverage report generated

### 21.3 Specific Module Tests

```bash
# Agent modules
npm test -- src/agent/

# Search modules
npm test -- src/search/

# Database modules
npm test -- src/db/
```

---

## Test Checklist Summary (Extended)

### Autonomous System (M1-M4)
- [ ] Scope enforcement tests pass
- [ ] Subagent spawning tests pass
- [ ] Scheduler tests pass
- [ ] Trigger tests pass
- [ ] Retry/self-correction tests pass

### Vector Search (M2 Extension)
- [ ] Vector store tests pass
- [ ] Hybrid search tests pass
- [ ] Cosine similarity works correctly
- [ ] Embedding serialization round-trips

### Autonomy Dashboard
- [ ] Dashboard loads at /autonomy
- [ ] All 4 tabs render correctly
- [ ] Stats cards display
- [ ] Refresh button works

### Full Test Suite
- [ ] `npm test` passes all tests
- [ ] No TypeScript errors: `npm run build`
- [ ] Frontend builds: `cd frontend && npm run build`
