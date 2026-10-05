# Ephemeral Summary GET Ownership Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for an explicitly approved bounded phase, or superpowers:executing-plans for direct execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated Alfred ownership lookups from EC summary GETs while preserving the existing cross-tenant ownership and deletion guarantees.

**Architecture:** A tenant-qualified Redis access record authorizes repeated EC GETs. A composite resolver uses the local record first for GET, falls back to the existing Alfred validation on a clean miss, and returns one complete access context that drives both authorization and storage routing. POST, DELETE, and every DC request retain authoritative Alfred validation; EC deletion writes terminal local state before storage or metadata deletion.

**Tech Stack:** TypeScript 6.0, Node.js >=22.22.2, pnpm 11, Express, Redis/ioredis, Mocha, Sinon, Fluid server-services contracts.

**Spec:** `docs/superpowers/specs/2026-10-05-ec-summary-get-fast-path-design.md`

## Global Constraints

- Build on merged PRs #27821, #27876, #27901, #28215, and #28220; do not revert their security or compatibility behavior.
- Do not reuse the GetSession/static-document-property implementation from closed PR #28333.
- Do not cache DC ownership or routing metadata.
- Do not authorize non-initial POST or DELETE from a local positive record.
- Do not trust caller-provided `Is-Ephemeral-Container` or `StorageName` for protected operations.
- Keep active and deleted records tenant-qualified and bounded by `createTime + ephemeralDocumentTTLSec`.
- Treat deleted state as terminal for the EC lifetime; active state must never overwrite it.
- EC document IDs are not reused within their original EC lifetime.
- A local EC hit performs one ownership-record read and no pre-response recheck.
- A Redis read failure may proceed for an Alfred-validated DC, but must fail closed for an Alfred-validated EC.
- Failure to mark an EC deleted must prevent the storage/metadata deletion path from proceeding.
- Do not add a feature flag or FRS deployment YAML change.
- Do not modify Alfred deletion, GitRest routing, or `server-services` `DocumentManager`.

---

## File Structure

### New files

- `server/historian/packages/historian-base/src/routes/summaryAccess.ts`
  - Owns `SummaryAccessResolver`, local-EC-first selection, Alfred fallback composition, final ownership telemetry, and `ISummaryAccessContext` creation.
- `server/historian/packages/historian-base/src/test/summaryAccessStore.spec.ts`
  - Tests Redis record encoding, TTL, tenant isolation, and atomic active/deleted transitions.
- `server/historian/packages/historian-base/src/test/summaryAccess.spec.ts`
  - Tests resolver source selection, fallback behavior, fail-closed behavior, telemetry, and races.

### Modified Historian files

- `server/historian/packages/historian-base/src/services/definitions.ts`
  - Defines the local access record/store contract and the resolved access context accepted by service construction.
- `server/historian/packages/historian-base/src/services/redisCache.ts`
  - Implements the access-store contract on the existing Historian Redis cache with strict parsing and atomic Redis operations.
- `server/historian/packages/historian-base/src/services/index.ts`
  - Exports the new contracts and type guard.
- `server/historian/packages/historian-base/src/routes/utils.ts`
  - Exposes the authoritative Alfred read/validation primitive and consumes a resolved context in `createGitService`.
- `server/historian/packages/historian-base/src/routes/summaries.ts`
  - Uses the resolver for protected operations and marks EC state deleted before summary deletion.
- `server/historian/packages/historian-base/src/test/utils/testCache.ts`
  - Implements an in-memory access store for route and resolver tests.
- `server/historian/packages/historian-base/src/test/summaryOwnership.spec.ts`
  - Retains authoritative Alfred regression coverage after validation helper extraction.
- `server/historian/packages/historian-base/src/test/routes.spec.ts`
  - Adds HTTP-level fast-path, cache-ordering, direct-context, and deletion tests.

### Modified Routerlicious files

- `server/routerlicious/packages/lambdas/src/deli/lambdaFactory.ts`
  - Calls Historian hard delete when cleanup is enabled and soft delete when cleanup is disabled, before EC metadata deletion.
- `server/routerlicious/packages/lambdas/src/test/deli/lambda.spec.ts`
  - Verifies hard/soft cleanup selection, ordering, failure behavior, and expired-EC behavior.

No runner/resource plumbing is required: production `RedisCache` already flows to the summary route. The route uses a type guard to detect whether that cache implements `IEphemeralSummaryAccessStore`; custom caches that implement only `ICache` preserve Alfred-only behavior.

---

## Phase 1: Local Access State and Resolution

**Phase boundary:** This phase delivers an independently tested EC access store and resolver without changing live route behavior. Stop after both milestones and obtain new approval before route integration.

### Milestone 1.1: Add the tenant-qualified EC access store

**Files:**
- Modify: `server/historian/packages/historian-base/src/services/definitions.ts`
- Modify: `server/historian/packages/historian-base/src/services/redisCache.ts`
- Modify: `server/historian/packages/historian-base/src/services/index.ts`
- Create: `server/historian/packages/historian-base/src/test/summaryAccessStore.spec.ts`

**Interfaces:**
- Consumes: existing `IRedisClientConnectionManager` used by `RedisCache`.
- Produces:

```ts
export interface IEphemeralSummaryAccessRecord {
    version: 1;
    state: "active" | "deleted";
    createTime: number;
}

export class MalformedEphemeralSummaryAccessRecordError extends Error {}

export type ActivateSummaryAccessResult =
    | "created"
    | "alreadyActive"
    | "deleted";

export interface IEphemeralSummaryAccessStore {
    readSummaryAccess(
        tenantId: string,
        documentId: string,
    ): Promise<IEphemeralSummaryAccessRecord | undefined>;
    activateSummaryAccessIfNotDeleted(
        tenantId: string,
        documentId: string,
        createTime: number,
        expiresAt: number,
    ): Promise<ActivateSummaryAccessResult>;
    markSummaryAccessDeleted(
        tenantId: string,
        documentId: string,
        createTime: number,
        expiresAt: number,
    ): Promise<void>;
}

export function isEphemeralSummaryAccessStore(
    cache: ICache | undefined,
): cache is ICache & IEphemeralSummaryAccessStore;
```

- Redis key: `git:summaryAccess:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`.
- Redis values: `A:<createTime>` and `D:<createTime>`.

- [ ] **Step 1: Write failing tests for tenant-qualified keys and strict parsing**

Create `src/test/summaryAccessStore.spec.ts` with a real mocked Redis connection:

```ts
import { strict as assert } from "assert";
import type * as Redis from "ioredis";
import * as sinon from "sinon";

import {
    MalformedEphemeralSummaryAccessRecordError,
    RedisCache,
} from "../services";
import { TestRedisClientConnectionManagerWithInvalidation } from "./testRedisClientConnectionManagerWithInvalidation";

describe("RedisCache ephemeral summary access", () => {
    const redisClientConnectionManager =
        new TestRedisClientConnectionManagerWithInvalidation();
    let cache: RedisCache;
    let rawRedis: Redis.Redis;

    beforeEach(() => {
        cache = new RedisCache(redisClientConnectionManager);
        rawRedis = redisClientConnectionManager.getRedisClient();
    });

    afterEach(() => {
        sinon.restore();
        redisClientConnectionManager.invalidateRedisClient();
    });

    it("isolates identical document ids by tenant", async () => {
        const cache = new RedisCache(redisClientConnectionManager);
        const expiresAt = Date.now() + 60_000;

        await cache.activateSummaryAccessIfNotDeleted(
            "tenant/a",
            "shared:id",
            100,
            expiresAt,
        );
        await cache.activateSummaryAccessIfNotDeleted(
            "tenant/b",
            "shared:id",
            200,
            expiresAt,
        );

        assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "shared:id"), {
            version: 1,
            state: "active",
            createTime: 100,
        });
        assert.deepStrictEqual(await cache.readSummaryAccess("tenant/b", "shared:id"), {
            version: 1,
            state: "active",
            createTime: 200,
        });
    });

    it("rejects a malformed stored record", async () => {
        await rawRedis.set(
            "git:summaryAccess:v1:tenant%2Fa:shared%3Aid",
            "unexpected",
        );

        await assert.rejects(
            cache.readSummaryAccess("tenant/a", "shared:id"),
            /Malformed ephemeral summary access record/,
        );
    });
});
```

- [ ] **Step 2: Write failing tests for terminal deleted state and TTL**

```ts
it("does not reactivate a deleted document", async () => {
    const expiresAt = Date.now() + 60_000;
    await cache.markSummaryAccessDeleted("tenant/a", "doc", 100, expiresAt);
    await cache.markSummaryAccessDeleted("tenant/a", "doc", 100, expiresAt);

    const result = await cache.activateSummaryAccessIfNotDeleted(
        "tenant/a",
        "doc",
        100,
        expiresAt,
    );

    assert.strictEqual(result, "deleted");
    assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "doc"), {
        version: 1,
        state: "deleted",
        createTime: 100,
    });
});

it("creates access once without replacing an existing active generation", async () => {
    const expiresAt = Date.now() + 60_000;
    assert.strictEqual(
        await cache.activateSummaryAccessIfNotDeleted(
            "tenant/a",
            "doc",
            100,
            expiresAt,
        ),
        "created",
    );
    assert.strictEqual(
        await cache.activateSummaryAccessIfNotDeleted(
            "tenant/a",
            "doc",
            200,
            expiresAt,
        ),
        "alreadyActive",
    );
    assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "doc"), {
        version: 1,
        state: "active",
        createTime: 100,
    });
});

it("does not treat malformed state as active during atomic activation", async () => {
    const key = "git:summaryAccess:v1:tenant%2Fa:doc";
    await rawRedis.set(key, "unexpected");

    await assert.rejects(
        cache.activateSummaryAccessIfNotDeleted(
            "tenant/a",
            "doc",
            100,
            Date.now() + 60_000,
        ),
        MalformedEphemeralSummaryAccessRecordError,
    );
    assert.strictEqual(await rawRedis.get(key), "unexpected");
});

it("expires access state at the supplied lifetime", async () => {
    const clock = sinon.useFakeTimers();
    await cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 100, 1_000);

    await clock.tickAsync(1_001);
    assert.strictEqual(await cache.readSummaryAccess("tenant/a", "doc"), undefined);
    clock.restore();
});
```

- [ ] **Step 3: Run the focused test to verify failure**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:test
pnpm exec mocha dist/test/summaryAccessStore.spec.js
```

Expected: TypeScript fails because the access-store methods and types do not exist.

- [ ] **Step 4: Add the access-store contracts and type guard**

Add to `services/definitions.ts`:

```ts
export interface IEphemeralSummaryAccessRecord {
    version: 1;
    state: "active" | "deleted";
    createTime: number;
}

export class MalformedEphemeralSummaryAccessRecordError extends Error {}

export type ActivateSummaryAccessResult =
    | "created"
    | "alreadyActive"
    | "deleted";

export interface IEphemeralSummaryAccessStore {
    readSummaryAccess(
        tenantId: string,
        documentId: string,
    ): Promise<IEphemeralSummaryAccessRecord | undefined>;
    activateSummaryAccessIfNotDeleted(
        tenantId: string,
        documentId: string,
        createTime: number,
        expiresAt: number,
    ): Promise<ActivateSummaryAccessResult>;
    markSummaryAccessDeleted(
        tenantId: string,
        documentId: string,
        createTime: number,
        expiresAt: number,
    ): Promise<void>;
}

export function isEphemeralSummaryAccessStore(
    cache: ICache | undefined,
): cache is ICache & IEphemeralSummaryAccessStore {
    const candidate = cache as Partial<IEphemeralSummaryAccessStore> | undefined;
    return (
        typeof candidate?.readSummaryAccess === "function" &&
        typeof candidate.activateSummaryAccessIfNotDeleted === "function" &&
        typeof candidate.markSummaryAccessDeleted === "function"
    );
}
```

Export the record, error, activation-result, store, and type-guard declarations from
`services/index.ts`.

- [ ] **Step 5: Implement strict Redis encoding and decoding**

Add private helpers to `RedisCache`:

```ts
private validateSummaryAccessWrite(createTime: number, expiresAt: number): void {
    if (!Number.isFinite(createTime) || createTime < 0) {
        throw new Error("Ephemeral summary access createTime must be a finite timestamp.");
    }
    if (!Number.isFinite(expiresAt)) {
        throw new Error("Ephemeral summary access expiration must be finite.");
    }
}

private getSummaryAccessKey(tenantId: string, documentId: string): string {
    return this.getKey(
        `summaryAccess:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`,
    );
}

private parseSummaryAccessRecord(value: string): IEphemeralSummaryAccessRecord {
    const match = /^(A|D):(\d+)$/.exec(value);
    if (match === null) {
        throw new MalformedEphemeralSummaryAccessRecordError(
            "Malformed ephemeral summary access record.",
        );
    }
    const createTime = Number(match[2]);
    if (!Number.isFinite(createTime)) {
        throw new MalformedEphemeralSummaryAccessRecordError(
            "Malformed ephemeral summary access record.",
        );
    }
    return {
        version: 1,
        state: match[1] === "A" ? "active" : "deleted",
        createTime,
    };
}

private getExpirySeconds(expiresAt: number): number {
    const expiresInMs = expiresAt - Date.now();
    return Math.max(1, Math.ceil(expiresInMs / 1000));
}
```

Implement `readSummaryAccess` with a raw Redis `GET`, returning `undefined` only for a clean miss.
Update the class declaration to
`export class RedisCache implements ICache, IEphemeralSummaryAccessStore`, import the new
contracts, and call `validateSummaryAccessWrite` before both write methods.

- [ ] **Step 6: Implement atomic activation and deleted marking**

Implement activation with one Redis `EVAL`:

```ts
const result = await redis.eval(
    `
local current = redis.call("GET", KEYS[1])
if current then
    if string.match(current, "^D:%d+$") then
        return 0
    end
    if string.match(current, "^A:%d+$") then
        return 1
    end
    return -1
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
return 2
`,
    1,
    key,
    `A:${createTime}`,
    this.getExpirySeconds(expiresAt),
);
if (result === -1) {
    throw new MalformedEphemeralSummaryAccessRecordError(
        "Malformed ephemeral summary access record.",
    );
}
return result === 0
    ? "deleted"
    : result === 1
      ? "alreadyActive"
      : "created";
```

Implement deletion as an idempotent terminal write:

```ts
const result = await redis.set(
    key,
    `D:${createTime}`,
    "EX",
    this.getExpirySeconds(expiresAt),
);
if (result !== "OK") {
    throw new Error(`Failed to mark ephemeral summary access deleted: ${result}`);
}
```

Validate `createTime` before either write.

- [ ] **Step 7: Run focused tests and compilation**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:compile
pnpm build:test
pnpm exec mocha dist/test/summaryAccessStore.spec.js
```

Expected: all store tests pass.

- [ ] **Step 8: Review the milestone diff**

Run:

```bash
git diff --check
git diff -- server/historian/packages/historian-base/src/services \
  server/historian/packages/historian-base/src/test/summaryAccessStore.spec.ts
```

Confirm that only the access-store contract, Redis implementation, exports, and focused tests changed.

- [ ] **Step 9: Commit**

```bash
git add \
  server/historian/packages/historian-base/src/services/definitions.ts \
  server/historian/packages/historian-base/src/services/redisCache.ts \
  server/historian/packages/historian-base/src/services/index.ts \
  server/historian/packages/historian-base/src/test/summaryAccessStore.spec.ts
git commit \
  -m "feat(historian): add EC summary access store" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 244ba26b-814f-4668-95f5-af9f5d8b08b7"
```

### Milestone 1.2: Add the composite summary access resolver

**Files:**
- Create: `server/historian/packages/historian-base/src/routes/summaryAccess.ts`
- Create: `server/historian/packages/historian-base/src/test/summaryAccess.spec.ts`
- Modify: `server/historian/packages/historian-base/src/routes/utils.ts`
- Modify: `server/historian/packages/historian-base/src/services/definitions.ts`
- Modify: `server/historian/packages/historian-base/src/services/index.ts`
- Modify: `server/historian/packages/historian-base/src/test/utils/testCache.ts`
- Modify: `server/historian/packages/historian-base/src/test/summaryOwnership.spec.ts`

**Interfaces:**
- Consumes:
  - `IEphemeralSummaryAccessStore` from Milestone 1.1.
  - Existing customer-token-aware Alfred `readDocument`.
- Produces:

```ts
export interface ISummaryAccessContext {
    tenantId: string;
    documentId: string;
    isEphemeralContainer: boolean;
    createTime: number;
    storageName?: string;
    source: "localEphemeral" | "alfred";
}

export interface IResolveSummaryAccessArgs extends IValidateSummaryDocumentArgs {
    accessStore?: IEphemeralSummaryAccessStore;
}

export async function resolveSummaryAccess(
    args: IResolveSummaryAccessArgs,
): Promise<ISummaryAccessContext>;
```

- `readAndValidateSummaryDocument(args)` remains the sole Alfred response validator.
- Final allowed telemetry is emitted exactly once by `resolveSummaryAccess`.
- `ignoreEphemeralFlag=true` bypasses the local store and normalizes the authoritative context to
  `isEphemeralContainer: false`, preserving existing deployments that disable EC routing.

- [ ] **Step 1: Extend the in-memory test cache with access-store behavior**

In `test/utils/testCache.ts`, add a separate map and terminal-state semantics:

```ts
private readonly summaryAccess = new Map<string, IEphemeralSummaryAccessRecord>();

async readSummaryAccess(
    tenantId: string,
    documentId: string,
): Promise<IEphemeralSummaryAccessRecord | undefined> {
    return this.summaryAccess.get(`${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`);
}

async activateSummaryAccessIfNotDeleted(
    tenantId: string,
    documentId: string,
    createTime: number,
    _expiresAt: number,
): Promise<ActivateSummaryAccessResult> {
    const key = `${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
    if (this.summaryAccess.get(key)?.state === "deleted") {
        return "deleted";
    }
    if (this.summaryAccess.has(key)) {
        return "alreadyActive";
    }
    this.summaryAccess.set(key, { version: 1, state: "active", createTime });
    return "created";
}

async markSummaryAccessDeleted(
    tenantId: string,
    documentId: string,
    createTime: number,
    _expiresAt: number,
): Promise<void> {
    this.summaryAccess.set(
        `${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`,
        { version: 1, state: "deleted", createTime },
    );
}
```

- [ ] **Step 2: Write failing local-hit and deleted-state resolver tests**

Create `src/test/summaryAccess.spec.ts` with this shared fixture:

```ts
import { strict as assert } from "assert";

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
    generateToken,
    getAuthorizationTokenFromCredentials,
    NetworkError,
} from "@fluidframework/server-services-client";
import type { IDocument } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as sinon from "sinon";

import {
    type IResolveSummaryAccessArgs,
    resolveSummaryAccess,
} from "../routes/summaryAccess";
import { MalformedEphemeralSummaryAccessRecordError } from "../services";
import { TestCache, TestDocumentManager } from "./utils";

const tenantId = "tenant/a";
const documentId = "shared:id";
const ttlSec = 24 * 60 * 60;
const ttlMs = ttlSec * 1000;
const accessToken = generateToken(tenantId, documentId, "tenant-key", [
    ScopeType.DocRead,
    ScopeType.DocWrite,
    ScopeType.SummaryWrite,
]);
const authorization = getAuthorizationTokenFromCredentials({
    user: tenantId,
    password: accessToken,
});

describe("summary access resolver", () => {
    const sandbox = sinon.createSandbox();
    let cache: TestCache;
    let documentManager: TestDocumentManager;
    let activeDocument: IDocument;

    beforeEach(() => {
        cache = new TestCache();
        documentManager = new TestDocumentManager();
        activeDocument = {
            version: "1.0",
            createTime: Date.now(),
            documentId,
            tenantId,
            session: {
                ordererUrl: "http://orderer",
                deltaStreamUrl: "http://delta",
                historianUrl: "http://historian",
                isSessionAlive: false,
                isSessionActive: false,
            },
            scribe: "",
            deli: "",
            storageName: "document-storage",
            isEphemeralContainer: false,
        };
    });

    afterEach(() => sandbox.restore());
```

Add the local-state tests inside that `describe`:

```ts
it("returns an active local EC context without Alfred", async () => {
    await cache.activateSummaryAccessIfNotDeleted(
        tenantId,
        documentId,
        activeDocument.createTime,
        activeDocument.createTime + ttlMs,
    );
    const readDocument = sandbox.spy(documentManager, "readDocument");
    const info = sandbox.spy(Lumberjack, "info");

    const context = await resolveSummaryAccess({
        tenantId,
        authorization,
        documentManager,
        operation: "get",
        routeType: "latest",
        ephemeralDocumentTTLSec: ttlSec,
        accessStore: cache,
    });

    assert.deepStrictEqual(context, {
        tenantId,
        documentId,
        isEphemeralContainer: true,
        createTime: activeDocument.createTime,
        storageName: undefined,
        source: "localEphemeral",
    });
    sinon.assert.notCalled(readDocument);
    sinon.assert.calledWithMatch(
        info,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            outcome: "allowed",
            source: "localEphemeral",
            localOutcome: "active",
        }),
    );
});

it("denies a deleted local EC before Alfred", async () => {
    const readDocument = sandbox.spy(documentManager, "readDocument");
    await cache.markSummaryAccessDeleted(
        tenantId,
        documentId,
        activeDocument.createTime,
        activeDocument.createTime + ttlMs,
    );

    await assert.rejects(
        resolveSummaryAccess(getArgs()),
        (error: NetworkError) => error.code === 404,
    );
    sinon.assert.notCalled(readDocument);
});
```

Close the `describe` after the remaining tests in Steps 3 and 7.

- [ ] **Step 3: Write failing fallback and failure-classification tests**

Cover these exact cases:

```ts
it("backfills a missing active EC record after Alfred validation", async () => {
    sandbox.stub(documentManager, "readDocument").resolves({
        ...activeDocument,
        isEphemeralContainer: true,
    });
    const activate = sandbox.spy(cache, "activateSummaryAccessIfNotDeleted");
    const info = sandbox.spy(Lumberjack, "info");

    const context = await resolveSummaryAccess(getArgs());

    assert.strictEqual(context.source, "alfred");
    assert.strictEqual(context.isEphemeralContainer, true);
    sinon.assert.calledOnceWithExactly(
        activate,
        tenantId,
        documentId,
        activeDocument.createTime,
        activeDocument.createTime + ttlMs,
    );
    sinon.assert.calledWithMatch(
        info,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            outcome: "allowed",
            source: "alfred",
            localOutcome: "miss",
            fallbackReason: "cleanMiss",
            activationOutcome: "created",
        }),
    );
});

it("does not cache an Alfred-validated DC", async () => {
    sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
    const activate = sandbox.spy(cache, "activateSummaryAccessIfNotDeleted");

    const context = await resolveSummaryAccess(getArgs());

    assert.strictEqual(context.isEphemeralContainer, false);
    assert.strictEqual(context.storageName, "document-storage");
    sinon.assert.notCalled(activate);
});

it("allows a DC but rejects an EC when the local store read fails", async () => {
    sandbox.stub(cache, "readSummaryAccess").rejects(new Error("redis unavailable"));
    const readDocument = sandbox.stub(documentManager, "readDocument");

    readDocument.resolves(activeDocument);
    assert.strictEqual((await resolveSummaryAccess(getArgs())).isEphemeralContainer, false);

    readDocument.resolves({ ...activeDocument, isEphemeralContainer: true });
    await assert.rejects(
        resolveSummaryAccess(getArgs()),
        (error: NetworkError) => error.code === 503,
    );
});

it("records malformed local state while allowing an Alfred-validated DC", async () => {
    sandbox.stub(cache, "readSummaryAccess").rejects(
        new MalformedEphemeralSummaryAccessRecordError(
            "Malformed ephemeral summary access record.",
        ),
    );
    sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
    const error = sandbox.spy(Lumberjack, "error");
    const info = sandbox.spy(Lumberjack, "info");

    assert.strictEqual((await resolveSummaryAccess(getArgs())).source, "alfred");
    sinon.assert.calledWithMatch(
        error,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            source: "localEphemeral",
            localOutcome: "malformed",
            fallbackReason: "localDependencyError",
        }),
    );
    sinon.assert.calledWithMatch(
        info,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            source: "alfred",
            localOutcome: "malformed",
            fallbackReason: "localDependencyError",
        }),
    );
});

it("denies when atomic activation observes concurrent deletion", async () => {
    sandbox.stub(documentManager, "readDocument").resolves({
        ...activeDocument,
        isEphemeralContainer: true,
    });
    sandbox.stub(cache, "activateSummaryAccessIfNotDeleted").resolves("deleted");
    const info = sandbox.spy(Lumberjack, "info");

    await assert.rejects(
        resolveSummaryAccess(getArgs()),
        (error: NetworkError) => error.code === 404,
    );
    sinon.assert.calledWithMatch(
        info,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            outcome: "notFound",
            source: "alfred",
            localOutcome: "miss",
            fallbackReason: "cleanMiss",
            activationOutcome: "deleted",
        }),
    );
});

it("logs a write error but preserves the fresh Alfred authorization", async () => {
    sandbox.stub(documentManager, "readDocument").resolves({
        ...activeDocument,
        isEphemeralContainer: true,
    });
    sandbox
        .stub(cache, "activateSummaryAccessIfNotDeleted")
        .rejects(new Error("redis unavailable"));
    const error = sandbox.spy(Lumberjack, "error");
    const info = sandbox.spy(Lumberjack, "info");

    const context = await resolveSummaryAccess(getArgs());

    assert.strictEqual(context.source, "alfred");
    sinon.assert.calledWithMatch(
        error,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            outcome: "dependencyError",
            source: "alfred",
            activationOutcome: "writeError",
        }),
    );
    sinon.assert.calledWithMatch(
        info,
        "HistorianSummaryDocumentOwnershipValidation",
        sinon.match({
            outcome: "allowed",
            source: "alfred",
            activationOutcome: "writeError",
        }),
    );
});
```

Also retain tests for customer-token forwarding, `storageName: null`, exact identity, scheduled deletion, retry behavior, malformed Alfred responses, and EC expiration.

Define the test helper in the same file so every test uses identical resolver inputs:

```ts
function getArgs(
    overrides: Partial<IResolveSummaryAccessArgs> = {},
): IResolveSummaryAccessArgs {
    return {
        tenantId,
        authorization,
        documentManager,
        operation: "get",
        routeType: "latest",
        ephemeralDocumentTTLSec: ttlSec,
        accessStore: cache,
        ...overrides,
    };
}
```

Add a test proving `ignoreEphemeralFlag: true` neither reads local state nor returns an EC context.

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:test
pnpm exec mocha dist/test/summaryAccess.spec.js
```

Expected: compilation fails because `resolveSummaryAccess` and `ISummaryAccessContext` do not exist.

- [ ] **Step 5: Extract the authoritative Alfred primitive**

In `routes/utils.ts`, export the authenticated identity helper as
`getSummaryDocumentIdentity`, export the non-disclosing denial helper as
`denySummaryDocumentAccess`, and export the telemetry helper as
`logSummaryOwnershipOutcome`. Split existing Alfred validation into:

```ts
export type SummaryOwnershipOutcome =
    | "allowed"
    | "notFound"
    | "identityMismatch"
    | "scheduledDeletion"
    | "dependencyError";

export interface ISummaryOwnershipTelemetryDetails {
    source?: "localEphemeral" | "alfred";
    localOutcome?:
        | "active"
        | "deleted"
        | "miss"
        | "expired"
        | "malformed"
        | "dependencyError";
    fallbackReason?: "cleanMiss" | "localDependencyError";
    activationOutcome?:
        | "created"
        | "alreadyActive"
        | "deleted"
        | "writeError";
}

export interface IValidatedSummaryDocument {
    accessToken: string;
    documentId: string;
    document: IDocument;
}

export async function readAndValidateSummaryDocument(
    args: IValidateSummaryDocumentArgs,
): Promise<IValidatedSummaryDocument>;

export function logSummaryOwnershipOutcome(
    tenantId: string,
    documentId: string,
    operation: SummaryOperation,
    routeType: SummaryRouteType,
    outcome: SummaryOwnershipOutcome,
    error?: unknown,
    details?: ISummaryOwnershipTelemetryDetails,
): void;

export function denySummaryDocumentAccess(
    tenantId: string,
    documentId: string,
    operation: SummaryOperation,
    routeType: SummaryRouteType,
    outcome: Exclude<SummaryOwnershipOutcome, "allowed" | "dependencyError">,
    details?: ISummaryOwnershipTelemetryDetails,
): never;
```

Rename the existing implementations and extend them exactly as follows:

```ts
export function logSummaryOwnershipOutcome(
    tenantId: string,
    documentId: string,
    operation: SummaryOperation,
    routeType: SummaryRouteType,
    outcome: SummaryOwnershipOutcome,
    error?: unknown,
    details?: ISummaryOwnershipTelemetryDetails,
): void {
    const properties = {
        [BaseTelemetryProperties.tenantId]: tenantId,
        [BaseTelemetryProperties.documentId]: documentId,
        [BaseTelemetryProperties.correlationId]:
            getGlobalTelemetryContext().getProperties().correlationId,
        operation,
        routeType,
        outcome,
        ...(details?.source === undefined ? {} : { source: details.source }),
        ...(details?.localOutcome === undefined
            ? {}
            : { localOutcome: details.localOutcome }),
        ...(details?.fallbackReason === undefined
            ? {}
            : { fallbackReason: details.fallbackReason }),
        ...(details?.activationOutcome === undefined
            ? {}
            : { activationOutcome: details.activationOutcome }),
        ...(error === undefined
            ? {}
            : {
                  dependencyStatus:
                      error instanceof NetworkError ? error.code : undefined,
                  dependencyErrorType:
                      error instanceof Error ? error.name : typeof error,
              }),
    };
    if (error === undefined) {
        Lumberjack.info(ownershipEventName, properties);
    } else {
        Lumberjack.error(ownershipEventName, properties);
    }
}

export function denySummaryDocumentAccess(
    tenantId: string,
    documentId: string,
    operation: SummaryOperation,
    routeType: SummaryRouteType,
    outcome: Exclude<SummaryOwnershipOutcome, "allowed" | "dependencyError">,
    details?: ISummaryOwnershipTelemetryDetails,
): never {
    logSummaryOwnershipOutcome(
        tenantId,
        documentId,
        operation,
        routeType,
        outcome,
        undefined,
        details,
    );
    throw new NetworkError(404, documentUnavailableMessage);
}
```

Move the current `validateSummaryDocument` implementation into
`readAndValidateSummaryDocument` without changing its retry, response validation, identity,
lifecycle, or expiration branches. Remove only the final `"allowed"` telemetry call and return
`{ accessToken, documentId, document }`. Add only defined fields from `details` to the existing
bounded ownership-event properties; do not serialize raw errors, tokens, or headers.
Add `telemetryDetails?: ISummaryOwnershipTelemetryDetails` to
`IValidateSummaryDocumentArgs`, and pass it through every Alfred `denySummaryDocumentAccess` and
`logSummaryOwnershipOutcome` branch so a miss that Alfred rejects still records why Alfred was
consulted.

Keep `validateSummaryDocument` temporarily as a compatibility wrapper for focused tests:

```ts
export async function validateSummaryDocument(
    args: IValidateSummaryDocumentArgs,
): Promise<IDocument> {
    const { document } = await readAndValidateSummaryDocument(args);
    logSummaryOwnershipOutcome(
        document.tenantId,
        document.documentId,
        args.operation,
        args.routeType,
        "allowed",
        undefined,
        { source: "alfred" },
    );
    return document;
}
```

Add an optional `source` field to ownership telemetry without changing existing outcome names.

- [ ] **Step 6: Implement the resolver**

Add to `services/definitions.ts`:

```ts
export interface ISummaryAccessContext {
    tenantId: string;
    documentId: string;
    isEphemeralContainer: boolean;
    createTime: number;
    storageName?: string;
    source: "localEphemeral" | "alfred";
}
```

In `routes/summaryAccess.ts`, define:

```ts
export interface IResolveSummaryAccessArgs
    extends IValidateSummaryDocumentArgs {
    accessStore?: IEphemeralSummaryAccessStore;
}
```

Then define these helpers before the resolver:

```ts
function contextFromDocument(
    document: IDocument,
    source: ISummaryAccessContext["source"],
    ignoreEphemeralFlag: boolean,
): ISummaryAccessContext {
    return {
        tenantId: document.tenantId,
        documentId: document.documentId,
        isEphemeralContainer:
            !ignoreEphemeralFlag && document.isEphemeralContainer === true,
        createTime: document.createTime,
        storageName: document.storageName ?? undefined,
        source,
    };
}

function logAllowed(
    args: IResolveSummaryAccessArgs,
    documentId: string,
    source: ISummaryAccessContext["source"],
    details: Omit<ISummaryOwnershipTelemetryDetails, "source"> = {},
): void {
    logSummaryOwnershipOutcome(
        args.tenantId,
        documentId,
        args.operation,
        args.routeType,
        "allowed",
        undefined,
        { source, ...details },
    );
}
```

Use `denySummaryDocumentAccess` for all local `deleted` and `expired` outcomes. Implement:

```ts
export async function resolveSummaryAccess(
    args: IResolveSummaryAccessArgs,
): Promise<ISummaryAccessContext> {
    const identity = getSummaryDocumentIdentity(args.tenantId, args.authorization);
    const expiresAtFor = (createTime: number) =>
        createTime + args.ephemeralDocumentTTLSec * 1000;

    if (
        args.operation === "get" &&
        !args.ignoreEphemeralFlag &&
        args.accessStore !== undefined
    ) {
        let localFailureOutcome: "malformed" | "dependencyError" | undefined;
        let record: IEphemeralSummaryAccessRecord | undefined;
        try {
            record = await args.accessStore.readSummaryAccess(
                args.tenantId,
                identity.documentId,
            );
        } catch (error) {
            localFailureOutcome =
                error instanceof MalformedEphemeralSummaryAccessRecordError
                    ? "malformed"
                    : "dependencyError";
            logSummaryOwnershipOutcome(
                args.tenantId,
                identity.documentId,
                args.operation,
                args.routeType,
                "dependencyError",
                error,
                {
                    source: "localEphemeral",
                    localOutcome: localFailureOutcome,
                    fallbackReason: "localDependencyError",
                },
            );
        }

        if (record?.state === "deleted") {
            return denySummaryDocumentAccess(
                args.tenantId,
                identity.documentId,
                args.operation,
                args.routeType,
                "notFound",
                {
                    source: "localEphemeral",
                    localOutcome: "deleted",
                },
            );
        }
        if (record?.state === "active") {
            if (Date.now() >= expiresAtFor(record.createTime)) {
                return denySummaryDocumentAccess(
                    args.tenantId,
                    identity.documentId,
                    args.operation,
                    args.routeType,
                    "notFound",
                    {
                        source: "localEphemeral",
                        localOutcome: "expired",
                    },
                );
            }
            logAllowed(args, identity.documentId, "localEphemeral", {
                localOutcome: "active",
            });
            return {
                tenantId: args.tenantId,
                documentId: identity.documentId,
                isEphemeralContainer: true,
                createTime: record.createTime,
                storageName: undefined,
                source: "localEphemeral",
            };
        }

        const fallbackDetails: Omit<ISummaryOwnershipTelemetryDetails, "source"> = {
            localOutcome: localFailureOutcome ?? "miss",
            fallbackReason:
                localFailureOutcome === undefined
                    ? "cleanMiss"
                    : "localDependencyError",
        };
        const validated = await readAndValidateSummaryDocument({
            ...args,
            telemetryDetails: { source: "alfred", ...fallbackDetails },
        });
        if (validated.document.isEphemeralContainer !== true) {
            logAllowed(args, identity.documentId, "alfred", fallbackDetails);
            return contextFromDocument(
                validated.document,
                "alfred",
                args.ignoreEphemeralFlag ?? false,
            );
        }
        if (localFailureOutcome !== undefined) {
            throw new NetworkError(503, "Ephemeral summary access state is unavailable.");
        }
        let activation: ActivateSummaryAccessResult | "writeError";
        try {
            activation = await args.accessStore.activateSummaryAccessIfNotDeleted(
                args.tenantId,
                identity.documentId,
                validated.document.createTime,
                expiresAtFor(validated.document.createTime),
            );
        } catch (error) {
            activation = "writeError";
            logSummaryOwnershipOutcome(
                args.tenantId,
                identity.documentId,
                args.operation,
                args.routeType,
                "dependencyError",
                error,
                {
                    source: "alfred",
                    ...fallbackDetails,
                    activationOutcome: "writeError",
                },
            );
        }
        if (activation === "deleted") {
            return denySummaryDocumentAccess(
                args.tenantId,
                identity.documentId,
                args.operation,
                args.routeType,
                "notFound",
                {
                    source: "alfred",
                    ...fallbackDetails,
                    activationOutcome: "deleted",
                },
            );
        }
        logAllowed(args, identity.documentId, "alfred", {
            ...fallbackDetails,
            activationOutcome: activation,
        });
        return contextFromDocument(
            validated.document,
            "alfred",
            args.ignoreEphemeralFlag ?? false,
        );
    }

    const validated = await readAndValidateSummaryDocument({
        ...args,
        telemetryDetails: { source: "alfred" },
    });
    logAllowed(args, identity.documentId, "alfred");
    return contextFromDocument(
        validated.document,
        "alfred",
        args.ignoreEphemeralFlag ?? false,
    );
}
```

Keep denial messages non-disclosing. Do not read local state for POST or DELETE.

- [ ] **Step 7: Update exports and authoritative regression tests**

- Export `ISummaryAccessContext` through `services/index.ts`.
- Update `summaryOwnership.spec.ts` imports for extracted helpers.
- Ensure existing Alfred-only tests still pass unchanged in meaning.
- Assert local allowed telemetry contains `source: "localEphemeral"` and fallback telemetry contains `source: "alfred"`.

- [ ] **Step 8: Run focused tests and compilation**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:compile
pnpm build:test
pnpm exec mocha \
  dist/test/summaryAccessStore.spec.js \
  dist/test/summaryAccess.spec.js \
  dist/test/summaryOwnership.spec.js
```

Expected: all focused tests pass.

- [ ] **Step 9: Review the milestone diff**

Run:

```bash
git diff --check
git diff -- \
  server/historian/packages/historian-base/src/routes/summaryAccess.ts \
  server/historian/packages/historian-base/src/routes/utils.ts \
  server/historian/packages/historian-base/src/services \
  server/historian/packages/historian-base/src/test
```

Confirm that live route creation still uses the old `validateSummaryDocument` path; this phase must not alter production request behavior.

- [ ] **Step 10: Commit**

```bash
git add \
  server/historian/packages/historian-base/src/routes/summaryAccess.ts \
  server/historian/packages/historian-base/src/routes/utils.ts \
  server/historian/packages/historian-base/src/services/definitions.ts \
  server/historian/packages/historian-base/src/services/index.ts \
  server/historian/packages/historian-base/src/test/summaryAccess.spec.ts \
  server/historian/packages/historian-base/src/test/summaryOwnership.spec.ts \
  server/historian/packages/historian-base/src/test/utils/testCache.ts
git commit \
  -m "feat(historian): resolve EC summary access locally" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 244ba26b-814f-4668-95f5-af9f5d8b08b7"
```

---

## Phase 2: Route Integration and Deletion Lifecycle

**Phase boundary:** This phase switches protected summary operations to the resolver and completes EC deletion ordering. Stop after both milestones; do not publish packages, update FRS, push, or create a PR without separate approval.

### Milestone 2.1: Use one resolved access context for protected summary operations

**Files:**
- Modify: `server/historian/packages/historian-base/src/services/definitions.ts`
- Modify: `server/historian/packages/historian-base/src/routes/utils.ts`
- Modify: `server/historian/packages/historian-base/src/routes/summaries.ts`
- Modify: `server/historian/packages/historian-base/src/test/routes.spec.ts`

**Interfaces:**
- Consumes: `resolveSummaryAccess()` and `ISummaryAccessContext` from Phase 1.
- Produces:

```ts
export interface ICreateGitServiceArgs {
    summaryAccessContext?: ISummaryAccessContext;
}
```

- Protected GET/POST/DELETE service construction uses context properties directly.
- Initial POST passes no context and preserves existing bootstrap behavior.

- [ ] **Step 1: Write failing HTTP tests for the EC local GET path**

Add to `routes.spec.ts`:

```ts
it("serves repeated EC latest and SHA GETs from local access without Alfred", async () => {
    const createTime = Date.now();
    await cache.activateSummaryAccessIfNotDeleted(
        tenantId,
        documentId,
        createTime,
        createTime + 24 * 60 * 60 * 1000,
    );
    const readDocument = sandbox.spy(documentManager, "readDocument");
    const getSummary = sandbox.stub(RestGitService.prototype, "getSummary").resolves({
        id: sha,
        trees: [],
        blobs: [],
    });

    await superTest
        .get(`/repos/${tenantId}/git/summaries/latest`)
        .set("Authorization", authorization)
        .expect(200);
    await superTest
        .get(`/repos/${tenantId}/git/summaries/${sha}`)
        .set("Authorization", authorization)
        .expect(200);

    sinon.assert.notCalled(readDocument);
    sinon.assert.calledTwice(getSummary);
});
```

Add a test that pre-populates both a cached latest summary and a deleted access record and asserts
404 before `RestGitService.getSummary`.

- [ ] **Step 2: Write failing tests for direct context consumption**

Replace the existing secondary-routing expectation with:

```ts
it("uses the Alfred context without secondary static or storage-name lookup", async () => {
    const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
    const getSummary = sandbox.stub(RestGitService.prototype, "getSummary").resolves({
        id: sha,
        trees: [],
        blobs: [],
    });

    await superTest
        .get(`/repos/${tenantId}/git/summaries/latest`)
        .set("Authorization", authorization)
        .expect(200);

    sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
    sinon.assert.notCalled(readStaticProperties);
    sinon.assert.notCalled(storageNameRetrieverGet);
    sinon.assert.calledOnce(getSummary);
});
```

Retain route tests proving:

- initial POST does not read ownership;
- non-initial POST and DELETE call Alfred;
- customer token is forwarded;
- cross-tenant latest/SHA denial occurs before cache/storage;
- `storageName: null` remains valid;
- DC uses the Alfred-returned storage name.

- [ ] **Step 3: Run route tests to verify failure**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:test
pnpm exec mocha dist/test/routes.spec.js --grep "summary ownership routes"
```

Expected: local-hit tests still call Alfred and protected service construction still performs secondary lookups.

- [ ] **Step 4: Add resolved context to service construction**

In `services/definitions.ts`, add `summaryAccessContext?: ISummaryAccessContext`.

In `createGitService`:

```ts
const isEphemeral =
    summaryAccessContext?.isEphemeralContainer ??
    (ignoreEphemeralFlag
        ? false
        : await checkAndCacheIsEphemeral({
              documentId,
              tenantId,
              documentManager,
              ephemeralDocumentTTLSec: ephemeralDocumentTTLSec ?? 24 * 60 * 60,
              isEphemeralContainerOverride: isEphemeralContainer,
              cache,
          }));

const calculatedStorageName =
    initialUpload && storageName
        ? storageName
        : summaryAccessContext !== undefined
          ? summaryAccessContext.storageName
          : (await storageNameRetriever?.get(tenantId, documentId)) ??
            customData?.storageName;
```

When a context exists, do not read or write the legacy ephemeral-flag cache.

- [ ] **Step 5: Switch protected routes to the resolver**

In `routes/summaries.ts`:

```ts
async function createProtectedSummaryService(
    tenantId: string,
    authorization: string | undefined,
    operation: SummaryOperation,
    routeType: SummaryRouteType,
    allowDisabledTenant = false,
    query?: Query,
): Promise<{ service: RestGitService; access: ISummaryAccessContext }> {
    const accessStore = isEphemeralSummaryAccessStore(cache) ? cache : undefined;
    const access = await resolveSummaryAccess({
        tenantId,
        authorization,
        documentManager,
        operation,
        routeType,
        ephemeralDocumentTTLSec: ephemeralDocumentTTLSec ?? 24 * 60 * 60,
        ignoreEphemeralFlag,
        reuseCustomerAccessToken: reuseCustomerAccessTokenForSummaryOwnership,
        accessStore,
    });
    const service = await createGitService({
        config,
        tenantId,
        authorization,
        tenantService,
        storageNameRetriever,
        documentManager,
        cache,
        summaryAccessContext: access,
        allowDisabledTenant,
        ephemeralDocumentTTLSec,
        simplifiedCustomDataRetriever,
        postEphemeralContainerChecker,
        query,
    });
    return { service, access };
}
```

GET, non-initial POST, and DELETE destructure `service`. Initial POST remains on the existing
caller-metadata branch.

- [ ] **Step 6: Run focused Historian tests**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:compile
pnpm build:test
pnpm exec mocha \
  dist/test/summaryAccessStore.spec.js \
  dist/test/summaryAccess.spec.js \
  dist/test/summaryOwnership.spec.js \
  dist/test/routes.spec.js --grep "summary ownership|summary access"
```

Expected: all focused tests pass.

- [ ] **Step 7: Review the milestone diff**

Run:

```bash
git diff --check
git diff -- \
  server/historian/packages/historian-base/src/routes \
  server/historian/packages/historian-base/src/services/definitions.ts \
  server/historian/packages/historian-base/src/test/routes.spec.ts
```

Confirm that:

- initial POST remains the only caller-metadata path;
- no protected path uses both resolver context and secondary static/storage-name lookup;
- no non-summary route changed.

- [ ] **Step 8: Commit**

```bash
git add \
  server/historian/packages/historian-base/src/services/definitions.ts \
  server/historian/packages/historian-base/src/routes/utils.ts \
  server/historian/packages/historian-base/src/routes/summaries.ts \
  server/historian/packages/historian-base/src/test/routes.spec.ts
git commit \
  -m "fix(historian): use resolved summary access context" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 244ba26b-814f-4668-95f5-af9f5d8b08b7"
```

### Milestone 2.2: Mark EC deletion and preserve Deli ordering

**Files:**
- Modify: `server/historian/packages/historian-base/src/routes/summaries.ts`
- Modify: `server/historian/packages/historian-base/src/test/routes.spec.ts`
- Modify: `server/routerlicious/packages/lambdas/src/deli/lambdaFactory.ts`
- Modify: `server/routerlicious/packages/lambdas/src/test/deli/lambda.spec.ts`

**Interfaces:**
- Consumes:
  - `ISummaryAccessContext` from Milestone 1.2.
  - `IEphemeralSummaryAccessStore.markSummaryAccessDeleted()` from Milestone 1.1.
- Produces:
  - EC DELETE ordering: Alfred validation → deleted record → summary cache/GitRest deletion.
  - Deli cleanup selection: hard delete when enabled; soft delete when disabled.

- [ ] **Step 1: Write failing Historian DELETE ordering tests**

Add route tests:

```ts
it("marks EC access deleted before calling GitRest", async () => {
    const events: string[] = [];
    sandbox.stub(documentManager, "readDocument").resolves({
        ...activeDocument,
        isEphemeralContainer: true,
    });
    sandbox.stub(cache, "markSummaryAccessDeleted").callsFake(async () => {
        events.push("markDeleted");
    });
    sandbox.stub(RestGitService.prototype, "deleteSummary").callsFake(async () => {
        events.push("deleteSummary");
        return true;
    });

    await superTest
        .delete(`/repos/${tenantId}/git/summaries`)
        .set("Authorization", authorization)
        .set("Soft-Delete", "false")
        .expect(200);

    assert.deepStrictEqual(events, ["markDeleted", "deleteSummary"]);
});

it("does not call GitRest when deleted-state persistence fails", async () => {
    sandbox.stub(documentManager, "readDocument").resolves({
        ...activeDocument,
        isEphemeralContainer: true,
    });
    sandbox.stub(cache, "markSummaryAccessDeleted").rejects(new Error("redis unavailable"));
    const deleteSummary = sandbox.stub(RestGitService.prototype, "deleteSummary");

    await superTest
        .delete(`/repos/${tenantId}/git/summaries`)
        .set("Authorization", authorization)
        .set("Soft-Delete", "true")
        .expect(500);

    sinon.assert.notCalled(deleteSummary);
});
```

- [ ] **Step 2: Write failing Deli hard/soft cleanup tests**

Add a helper that creates an EC Deli lambda with stubbed methods on the test tenant's `GitManager`,
configurable cleanup, and a spyable document repository:

```ts
describe("ephemeral summary cleanup", () => {
async function createEphemeralCleanupHarness(
    enableCleanup: boolean,
    options: { createTime?: number; ttlSec?: number } = {},
) {
    const events = metadataEvents;
    const ephemeralDocument: IDocument = {
        version: "1.0",
        createTime: options.createTime ?? Date.now(),
        documentId: testId,
        tenantId: testTenantId,
        session: {
            ordererUrl: "http://orderer",
            deltaStreamUrl: "http://delta",
            historianUrl: "http://historian",
            isSessionAlive: true,
            isSessionActive: true,
        },
        scribe: "",
        deli: "",
        isEphemeralContainer: true,
    };
    const gitManager = await testTenantManager.getTenantGitManager(
        testTenantId,
        testId,
    );
    const deleteSummary = Sinon.stub(gitManager, "deleteSummary").callsFake(
        async (softDelete: boolean) => {
            events.push(`delete:${softDelete}`);
            return true;
        },
    );
    Sinon.stub(gitManager, "getRef").resolves(null);
    readDocument.resolves(ephemeralDocument);

    const serviceConfiguration = {
        ...DefaultServiceConfiguration,
        deli: {
            ...DefaultServiceConfiguration.deli,
            enableEphemeralContainerSummaryCleanup: enableCleanup,
        },
    };
    const factory = new DeliLambdaFactory(
        mongoManager,
        documentRepository,
        checkpointService,
        testTenantManager,
        undefined,
        testForwardProducer,
        undefined,
        testReverseProducer,
        serviceConfiguration,
        undefined,
        options.ttlSec ?? 9_000,
    );
    const lambda = await factory.create(
        { documentId: testId, tenantId: testTenantId },
        testContext,
    );
    events.length = 0; // Ignore the factory's initial session-active metadata write.
    return { deleteSummary, events, factory, lambda };
}
```

Promote `mongoManager`, `documentRepository`, and `checkpointService` from `beforeEach` locals to
describe-scope variables so the harness can reuse the same test dependencies. Replace the current
anonymous `readOne` fake with a describe-scope `readDocument` stub whose default result remains the
existing test document. Add a describe-scope `metadataEvents: string[]`; reset it in `beforeEach`,
and replace `updateOne` and `deleteOne` there with fakes that append `"updateMetadata"` and
`"deleteMetadata"` respectively. Add `NetworkError` to the existing
`@fluidframework/server-services-client` import and add `type IDocument` to the existing
`@fluidframework/server-services-core` import.

Use this describe-scope setup and replace the current local declarations/replacements in
`beforeEach`:

```ts
let mongoManager: MongoManager;
let documentRepository: TestNotImplementedDocumentRepository;
let checkpointService: CheckpointService;
let readDocument = Sinon.stub();
let metadataEvents: string[] = [];

beforeEach(async () => {
    const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
    mongoManager = new MongoManager(dbFactory);
    documentRepository = new TestNotImplementedDocumentRepository();
    const checkpointRepository = new TestNotImplementedCheckpointRepository();
    checkpointService = new CheckpointService(
        checkpointRepository,
        documentRepository,
        false,
    );
    metadataEvents = [];
    readDocument = Sinon.stub(documentRepository, "readOne").resolves(
        _.cloneDeep(testData[0]),
    );
    Sinon.stub(documentRepository, "updateOne").callsFake(async () => {
        metadataEvents.push("updateMetadata");
    });
    Sinon.stub(documentRepository, "deleteOne").callsFake(async () => {
        metadataEvents.push("deleteMetadata");
    });

    // Keep the existing checkpoint, Kafka, tenant-manager, context, and factory setup unchanged.
});
```

Add one deterministic async helper:

```ts
async function waitForCondition(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
    assert.fail("Timed out waiting for asynchronous Deli cleanup.");
}
```

Tests:

```ts
it("hard deletes before metadata when cleanup is enabled", async () => {
    const harness = await createEphemeralCleanupHarness(true);
    harness.lambda.close(LambdaCloseType.ActivityTimeout);
    await waitForCondition(() => harness.events.includes("updateMetadata"));

    Sinon.assert.calledOnceWithExactly(harness.deleteSummary, false);
    assert.deepStrictEqual(harness.events.slice(0, 2), [
        "delete:false",
        "updateMetadata",
    ]);
});

it("soft deletes before metadata when cleanup is disabled", async () => {
    const harness = await createEphemeralCleanupHarness(false);
    harness.lambda.close(LambdaCloseType.ActivityTimeout);
    await waitForCondition(() => harness.events.includes("updateMetadata"));

    Sinon.assert.calledOnceWithExactly(harness.deleteSummary, true);
    assert.deepStrictEqual(harness.events.slice(0, 2), [
        "delete:true",
        "updateMetadata",
    ]);
});

it("does not mutate metadata when Historian deletion fails", async () => {
    const errorLog = Sinon.spy(Lumberjack, "error");
    const harness = await createEphemeralCleanupHarness(false);
    harness.deleteSummary.rejects(
        new NetworkError(503, "historian unavailable", false),
    );
    harness.lambda.close(LambdaCloseType.ActivityTimeout);
    await waitForCondition(() =>
        errorLog.calledWithMatch("Failed to handle session alive and active"),
    );

    assert.strictEqual(harness.events.includes("updateMetadata"), false);
    assert.strictEqual(harness.events.includes("deleteMetadata"), false);
});

it("skips Historian after EC expiry and continues metadata cleanup", async () => {
    const harness = await createEphemeralCleanupHarness(true, {
        createTime: Date.now() - 2_000,
        ttlSec: 1,
    });
    harness.lambda.close(LambdaCloseType.ActivityTimeout);
    await waitForCondition(() => harness.events.includes("updateMetadata"));

    Sinon.assert.notCalled(harness.deleteSummary);
    assert.deepStrictEqual(harness.events, ["updateMetadata"]);
});
});
```

- [ ] **Step 3: Run the focused tests to verify failure**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:test
pnpm exec mocha dist/test/routes.spec.js --grep "marks EC access deleted|deleted-state"

cd ../../../routerlicious/packages/lambdas
pnpm build:test
pnpm exec mocha dist/test/deli/lambda.spec.js --grep "ephemeral summary cleanup"
```

Expected: Historian does not mark deleted and Deli skips Historian entirely when cleanup is disabled.

- [ ] **Step 4: Mark deleted state before EC summary deletion**

In `routes/summaries.ts`:

```ts
const { service, access } = await createProtectedSummaryService(
    tenantId,
    authorization,
    "delete",
    "notApplicable",
    true,
);
const accessStore = isEphemeralSummaryAccessStore(cache) ? cache : undefined;
if (access.isEphemeralContainer && accessStore !== undefined) {
    await accessStore.markSummaryAccessDeleted(
        access.tenantId,
        access.documentId,
        access.createTime,
        access.createTime + (ephemeralDocumentTTLSec ?? 24 * 60 * 60) * 1000,
    );
}
```

Call `service.deleteSummary` only after the marker write resolves. Do not catch marker failures.

- [ ] **Step 5: Make Deli revoke access regardless of physical cleanup setting**

Replace the nested cleanup condition with:

```ts
if (this.isEphemeralDocumentWithinTtl(document)) {
    const softDelete =
        !this.serviceConfiguration.deli.enableEphemeralContainerSummaryCleanup;
    await requestWithRetry(
        async () => gitManager.deleteSummary(softDelete),
        "deliLambda_onClose",
        baseLumberjackProperties,
        undefined,
        3,
    );
} else {
    Lumberjack.info(
        "Ephemeral container TTL has expired, not calling deleteSummary",
        {
            ...baseLumberjackProperties,
            documentCreationTime: document.createTime,
            documentExpirationTime:
                document.createTime + (this.ephemeralDocumentTTLSec ?? 0) * 1000,
        },
    );
}
```

Keep this awaited block before `documentRepository.updateOne` or `deleteOne`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:compile
pnpm build:test
pnpm exec mocha \
  dist/test/summaryAccessStore.spec.js \
  dist/test/summaryAccess.spec.js \
  dist/test/summaryOwnership.spec.js \
  dist/test/routes.spec.js --grep "summary ownership|summary access|deleted"

cd ../../../routerlicious/packages/lambdas
pnpm build:compile
pnpm exec mocha dist/test/deli/lambda.spec.js --grep "ephemeral summary cleanup"
```

Expected: all focused tests pass.

- [ ] **Step 7: Run package validation**

Run:

```bash
cd server/historian/packages/historian-base
pnpm build:compile
pnpm build:test
pnpm test
pnpm prettier
pnpm exec eslint --quiet src

cd ../../../routerlicious/packages/lambdas
pnpm build:compile
pnpm exec mocha dist/test/deli/lambda.spec.js
pnpm prettier
pnpm exec eslint --quiet src

cd ../../../..
git diff --check
```

Expected:

- Historian compilation and full tests pass.
- Lambdas compilation and Deli tests pass.
- Formatting and linting report no errors.
- `git diff --check` is clean.

- [ ] **Step 8: Review the complete implementation diff**

Run:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- \
  server/historian/packages/historian-base \
  server/routerlicious/packages/lambdas/src/deli/lambdaFactory.ts \
  server/routerlicious/packages/lambdas/src/test/deli/lambda.spec.ts
```

Confirm:

- no GetSession/static-cache code;
- no Alfred, GitRest, or `server-services` DocumentManager changes;
- no feature flag;
- no FRS files;
- EC GET uses one ownership-record read;
- DC/POST/DELETE retain Alfred validation;
- deletion marker write precedes storage deletion;
- Deli Historian deletion precedes metadata mutation.

- [ ] **Step 9: Commit**

```bash
git add \
  server/historian/packages/historian-base/src/routes/summaries.ts \
  server/historian/packages/historian-base/src/test/routes.spec.ts \
  server/routerlicious/packages/lambdas/src/deli/lambdaFactory.ts \
  server/routerlicious/packages/lambdas/src/test/deli/lambda.spec.ts
git commit \
  -m "fix(server): revoke EC summary access before cleanup" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 244ba26b-814f-4668-95f5-af9f5d8b08b7"
```

---

## Post-Plan Delivery Boundary

After Phase 2 validation:

- stop with a clean worktree;
- report commits and test results;
- do not push;
- do not create a GitHub PR;
- do not publish packages;
- do not update FRS package versions;
- do not modify deployment configuration.

Each of those actions requires a separate user request or approval.
