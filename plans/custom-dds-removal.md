# Custom DDS Removal Plan

## Goal
Reduce exposure of DDS base classes and interfaces (`SharedObject`, `SharedObjectCore`, `IChannel`, `IChannelFactory`) to prevent external/third-party custom DDS implementations while ensuring all DDSes are owned by Fluid.

---

## Current State Analysis

### DDS Audit Results
Found **19 total DDS implementations** in the codebase - all are Fluid-owned:

| Category | DDSes |
|----------|-------|
| **Active/Stable** | SharedCell, SharedMap, SharedDirectory, SharedTree, SharedSegmentSequence, TaskManager, ConsensusOrderedCollection, ConsensusRegisterCollection, PactMap, Ink |
| **Legacy (@legacy @beta)** | SharedCounter, SharedString, SharedMatrix, SharedSummaryBlock |
| **Internal Legacy** | SharedSignal, SharedArray (in legacy-dds package) |
| **PropertyDDS (experimental)** | SharedPropertyTree, DeflatedPropertyTree, LZ4PropertyTree |

**No external/third-party DDSes found.** All DDSes are already in Fluid's codebase.

### Open Question
- **Other DDSes**: Need to confirm whether there are other partner DDSes that are not yet accounted for.

### Current Public API Surface (Enabling Custom DDS)

**From `@fluidframework/shared-object-base` (index.ts:8-15):**
```typescript
export {
  SharedObject,           // @legacy @beta - base class for DDSes
  SharedObjectCore,       // @legacy @beta - core base class
  type ISharedObjectKind,
  type SharedObjectKind,  // @sealed @public - safe type
  createSharedObjectKind, // factory wrapper
} from "./sharedObject.js";
export type { ISharedObject, ISharedObjectEvents } from "./types.js";
```

**From `@fluidframework/datastore-definitions` (index.ts:13-20):**
```typescript
export type {
  IChannel,          // @legacy @beta - channel interface
  IChannelFactory,   // @legacy @beta - factory pattern
  IChannelServices,
  IChannelStorageService,
  IDeltaConnection,
  IDeltaHandler,     // @legacy @beta - op processing
} from "./channel.js";
```

### Code Comments Indicating Intent
- `sharedObject.ts:84-86`: "This class should eventually be made internal, as custom subclasses of it outside this repository are intended to be made unsupported in the future."
- `channel.ts:26-27`: "this should probably eventually become internal"
- `types.ts:56-58`: "This interface is not intended to be implemented outside this repository"

---

## Implementation Plan

### Phase 0: Pre-announce deprecations

Add a changeset for the affected packages that describes the classes and types that will be deprecated in the upcoming release 2.82.0. The deprecated APIs will be fully removed in release 2.100.0.

### Phase 1: Add Deprecation Notices

Add `@deprecated` JSDoc tags to all public exports that enable custom DDS creation.

**File: `packages/dds/shared-object-base/src/sharedObject.ts`**

Update `SharedObjectCore` class (line 87):
```typescript
/**
 * Base class from which all {@link ISharedObject|shared objects} derive.
 * ...existing docs...
 * @deprecated SharedObjectCore is intended for internal Fluid Framework use only.
 * External implementations of custom DDSes are not supported and this class will
 * be removed from the public API in a future release.
 * @legacy @beta
 */
export abstract class SharedObjectCore<...>
```

Update `SharedObject` class (around line 740):
```typescript
/**
 * ...existing docs...
 * @deprecated SharedObject is intended for internal Fluid Framework use only.
 * External implementations of custom DDSes are not supported and this class will
 * be removed from the public API in a future release. Use existing DDS types
 * (SharedMap, SharedTree, etc.) instead.
 * @legacy @beta
 */
export abstract class SharedObject<...>
```

Update `createSharedObjectKind` function:
```typescript
/**
 * ...existing docs...
 * @deprecated createSharedObjectKind is intended for internal Fluid Framework use only.
 * External implementations of custom DDSes are not supported and this function will
 * be removed from the public API in a future release.
 */
export function createSharedObjectKind<...>
```

**File: `packages/dds/shared-object-base/src/types.ts`**

Update `ISharedObject` interface:
```typescript
/**
 * ...existing docs...
 * @deprecated ISharedObject is intended for internal Fluid Framework use only.
 * External implementations are not supported. Use existing DDS types instead.
 * @legacy @beta
 */
export interface ISharedObject<...>
```

**File: `packages/runtime/datastore-definitions/src/channel.ts`**

Update `IChannel` interface (line 36):
```typescript
/**
 * ...existing docs...
 * @deprecated IChannel is intended for internal Fluid Framework use only.
 * External implementations of channels/DDSes are not supported and this interface
 * will be removed from the public API in a future release.
 * @legacy @beta
 */
export interface IChannel extends IFluidLoadable {
```

Update `IChannelFactory` interface (around line 294):
```typescript
/**
 * ...existing docs...
 * @deprecated IChannelFactory is intended for internal Fluid Framework use only.
 * External implementations of custom DDSes are not supported and this interface
 * will be removed from the public API in a future release.
 * @legacy @beta
 */
export interface IChannelFactory<TChannel extends IChannel = IChannel> {
```

Update `IDeltaHandler` interface (around line 140):
```typescript
/**
 * ...existing docs...
 * @deprecated IDeltaHandler is intended for internal Fluid Framework use only.
 * @legacy @beta
 */
export interface IDeltaHandler<T = unknown> {
```

### Phase 2: Add changesets

Add changesets for the

```markdown
## [Next Version]

### Deprecations

- SharedObject, SharedObjectCore, ISharedObject, and createSharedObjectKind have been deprecated ([#XXXXX](URL))

  These APIs are intended for internal Fluid Framework use only. External implementations
  of custom DDSes are not supported and these exports will be removed from the public API
  in a future release.

  Applications should use the existing DDS types (SharedMap, SharedTree, SharedCell, etc.)
  rather than implementing custom DDSes.
```

**File: `packages/runtime/datastore-definitions/CHANGELOG.md`**

Add entry:
```markdown
## [Next Version]

### Deprecations

- IChannel, IChannelFactory, and IDeltaHandler have been deprecated ([#XXXXX](URL))

  These interfaces are intended for internal Fluid Framework use only. External
  implementations of channels/DDSes are not supported and these exports will be
  removed from the public API in a future release.
```

### Phase 3: Run API Extractor & Verify

After making the changes:

1. Run build to regenerate API reports:
   ```bash
   pnpm build
   ```

2. Verify API reports show deprecation:
   - `packages/dds/shared-object-base/api-report/*.api.md`
   - `packages/runtime/datastore-definitions/api-report/*.api.md`

3. Run tests to ensure no regressions:
   ```bash
   pnpm test
   ```

### Phase 4: Future Removal (2.100.0 release)

In a subsequent minor release, move exports from public to internal:

**File: `packages/dds/shared-object-base/src/index.ts`**

Change from:
```typescript
export {
  SharedObject,
  SharedObjectCore,
  ...
} from "./sharedObject.js";
```

To only export in internal index, not public. The `SharedObjectKind` type (which is `@sealed`) remains public as the safe API.

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/dds/shared-object-base/src/sharedObject.ts` | Add @deprecated to SharedObjectCore, SharedObject, createSharedObjectKind |
| `packages/dds/shared-object-base/src/types.ts` | Add @deprecated to ISharedObject |
| `packages/runtime/datastore-definitions/src/channel.ts` | Add @deprecated to IChannel, IChannelFactory, IDeltaHandler |
| `packages/dds/shared-object-base/CHANGELOG.md` | Add deprecation notice |
| `packages/runtime/datastore-definitions/CHANGELOG.md` | Add deprecation notice |

---

## Verification Plan

1. **Build**: `pnpm build` - Ensure all packages compile
2. **Tests**: `pnpm test` - Ensure no test regressions
3. **API Reports**: Check that `@deprecated` appears in generated API reports
4. **Lint**: `pnpm lint` - Ensure no lint errors
5. **External Test**: (Manual) Confirm that TypeScript shows deprecation warnings when importing these APIs

---

## Summary

- **No external DDSes found** - All 19 DDSes are already Fluid-owned
- **Deprecation approach**: Add `@deprecated` JSDoc now, remove from public exports in follow-up release
- **Safe API preserved**: `SharedObjectKind<T>` remains public and @sealed
- **Open question**: Need to confirm whether there are other partner DDSes that are not yet accounted for
