# Custom DDS Removal Plan

## Goals

1. **Reduce public API surface** - Remove DDS base classes and interfaces (`SharedObject`, `SharedObjectCore`, `IChannel`, `IChannelFactory`, etc.) from the public API to prevent external/third-party custom DDS implementations.

2. **Enable faster iteration** - When these types are public or `@legacy @beta`, changes must move slowly due to compatibility requirements. Making them internal allows the team to iterate more rapidly on DDS infrastructure.

3. **Simplify the API** - Consolidate around SharedTree as the recommended DDS for most use cases, while maintaining existing DDSes for specific scenarios.

---

## Current State Analysis

### DDS Audit Results
Found **20 total DDS implementations** in the codebase - all are Fluid-owned:

| Category | DDSes |
|----------|-------|
| **Active/Stable** | SharedCell, SharedMap, SharedDirectory, SharedTree, SharedSegmentSequence, TaskManager, ConsensusOrderedCollection, ConsensusRegisterCollection |
| **Legacy (@legacy @beta)** | SharedCounter, SharedString, SharedMatrix, SharedSummaryBlock |
| **Internal Legacy** | SharedSignal, SharedArray (in legacy-dds package) |
| **Experimental** | PactMap, Ink, SharedPropertyTree, DeflatedPropertyTree, LZ4PropertyTree (PropertyDDS), experimental SharedTree (in `experimental/dds/tree`) |

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

**From `@fluidframework/datastore-definitions` (index.ts:13-20, 34):**
```typescript
export type {
  IChannel,              // @legacy @beta - channel interface
  IChannelFactory,       // @legacy @beta - factory pattern
  IChannelServices,      // @legacy @beta - services bundle
  IChannelStorageService,// @legacy @beta - storage service
  IDeltaConnection,      // @legacy @beta - delta connection
  IDeltaHandler,         // @legacy @beta - op processing
} from "./channel.js";
export type { IChannelAttributes } from "./storage.js"; // @legacy @beta
```

### Code Comments Indicating Intent
- `sharedObject.ts:84-86`: "This class should eventually be made internal, as custom subclasses of it outside this repository are intended to be made unsupported in the future."
- `channel.ts:26-27`: "this should probably eventually become internal"
- `types.ts:56-58`: "This interface is not intended to be implemented outside this repository"

---

## Implementation Plan

### Recommended Approach

Based on feedback, the recommended approach is to **make things internal directly** and use build tooling to discover any issues. Deprecation is an intermediate step that may not be necessary if we're confident in making the change. However, we still need to announce the breaking change.

### Phase 0: Pre-announce API changes

Add a changeset for the affected packages that describes the types that will be made internal in the upcoming release. This gives consumers notice of the upcoming change.

### Phase 1: Move exports from public to internal

Move all DDS-implementation-enabling exports to internal-only. The following types should be moved:

**From `@fluidframework/shared-object-base`:**
- `SharedObject` - base class
- `SharedObjectCore` - core base class
- `ISharedObject` - interface
- `ISharedObjectEvents` - events interface
- `createSharedObjectKind` - factory creator
- `ISharedObjectKind` - type (keep `SharedObjectKind` public as the safe sealed type)

**From `@fluidframework/datastore-definitions`:**
- `IChannel` - channel interface (note: has exposure at datastore layer - need to sever typing)
- `IChannelFactory` - factory interface
- `IChannelServices` - services bundle
- `IChannelStorageService` - storage service interface
- `IDeltaConnection` - delta connection interface
- `IDeltaHandler` - op processing interface
- `IChannelAttributes` - channel attributes

### Phase 2: Identify additional types

Manually inspect the API reports at the lowest shipped layer to identify any additional types that should be made internal. Use build tooling and trial/error to discover issues.

Check API reports:
- `packages/dds/shared-object-base/api-report/*.api.md`
- `packages/runtime/datastore-definitions/api-report/*.api.md`

### Phase 3: Address IChannel at datastore layer

#### The Problem

`IFluidDataStoreRuntime` (marked `@legacy @beta`) has methods that reference `IChannel`:

```typescript
interface IFluidDataStoreRuntime {
    getChannel(id: string): Promise<IChannel>;
    createChannel(id: string | undefined, type: string): IChannel;
    addChannel(channel: IChannel): void;
    bindChannel(channel: IChannel): void;
}
```

If `IChannel` becomes `@internal`, API-extractor will report incompatible release tags.

#### Usage Analysis

Analyzed how these methods are used across the codebase:

1. **Pattern: Create → Cast → Use** (most common)
   ```typescript
   const channel = runtime.createChannel(id, SharedMap.getFactory().type);
   const map = channel as SharedMap;  // Immediate cast to specific DDS
   map.set("key", value);
   ```

2. **Pattern: Get → Cast → Use**
   ```typescript
   const channel = await runtime.getChannel(id);
   const map = channel as ISharedMap;
   ```

3. **`addChannel`/`bindChannel`**: Only used internally by DDS implementations.

**Key Finding**: External callers ALWAYS immediately cast `IChannel` to specific DDS types. They never use `IChannel` methods directly.

#### IChannel Methods (Service-Level Only)

These methods are only used by the runtime, not by external code:
- `getAttachSummary()` - Summary generation
- `summarize()` - Summary generation
- `isAttached()` - Attachment state
- `connect()` - Connection setup
- `getGCData()` - Garbage collection
- `attributes` - Channel metadata

External code only accesses:
- `handle` (from `IFluidLoadable`)
- `id` (rarely)
- Casting to specific DDS types

#### Recommended Solution: Phased Internalization

Rather than creating a new minimal interface (which adds API surface), use a phased approach:

**Phase 3a: Keep `IChannel` as `@legacy @beta`**
- `IChannel` remains accessible in the legacy API
- `IChannelAttributes` remains accessible (referenced by `IChannel.attributes`)
- This maintains `IFluidDataStoreRuntime` compatibility

**Phase 3b: Internalize implementation-enabling interfaces**
Make `IChannelFactory` `@internal` to prevent custom DDS factory implementations.

**Transitive dependency constraint**: The following interfaces CANNOT be made internal because
they are transitively referenced by `IChannel` (which must remain public for `IFluidDataStoreRuntime`):
- `IChannelServices` - Referenced by `IChannel.connect(services: IChannelServices)`
- `IChannelStorageService` - Referenced by `IChannelServices.objectStorage`
- `IDeltaConnection` - Referenced by `IChannelServices.deltaConnection`
- `IDeltaHandler` - Referenced by `IDeltaConnection.attach(handler: IDeltaHandler)`

**Why this still works**: To implement a custom DDS, you need:
1. ❌ `SharedObject`/`SharedObjectCore` base classes → Now `@internal`
2. ❌ `IChannelFactory` to create the factory → Now `@internal`
3. ⚠️ `IChannelServices` et al. → Must stay `@legacy @beta` but useless without #1 and #2

Keeping `IChannel` and its dependencies as `@legacy @beta` is acceptable because:
- External code can't implement it (no base class)
- External code can't create custom factories (no `IChannelFactory`)
- The service interfaces are useless without the implementation infrastructure
- It maintains backward compatibility with `IFluidDataStoreRuntime`

#### Alternative Approaches (Not Recommended)

1. **Use `unknown` return type**: Loses type safety, requires casts everywhere
2. **Create minimal public interface**: Adds API surface, requires migration
3. **Split `IFluidDataStoreRuntime`**: Major breaking change
4. **Make everything internal**: Breaks `IFluidDataStoreRuntime` compatibility

#### Future Considerations

In a future major version, `IChannel` could potentially be made internal by:
1. Updating `IFluidDataStoreRuntime` methods to return `IFluidLoadable & { id: string }`
2. Or deprecating the channel methods entirely in favor of higher-level APIs
3. Using `unknown` or `IFluidLoadable` as the return type for `getChannel`/`createChannel`, with each DDS package offering a type check/narrowing function for consumers who prefer runtime type safety over casting
4. This would require coordinated changes across multiple packages

### Phase 4: Build and verify

After making the changes:

1. Run build to regenerate API reports and discover issues:
   ```bash
   pnpm build
   ```

2. Address any build errors that indicate types are being used across package boundaries unexpectedly.

3. Verify API reports no longer export the internal types publicly.

4. Run tests to ensure no regressions:
   ```bash
   pnpm test
   ```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/dds/shared-object-base/src/index.ts` | Move SharedObject, SharedObjectCore, ISharedObject, createSharedObjectKind, ISharedObjectKind to internal exports only |
| `packages/dds/shared-object-base/src/sharedObject.ts` | Update API tags from @legacy @beta to @internal |
| `packages/dds/shared-object-base/src/types.ts` | Update API tags from @legacy @beta to @internal |
| `packages/runtime/datastore-definitions/src/index.ts` | Move channel-related types to internal exports only |
| `packages/runtime/datastore-definitions/src/channel.ts` | Update API tags from @legacy @beta to @internal |
| `packages/runtime/datastore-definitions/src/storage.ts` | Update IChannelAttributes API tag to @internal |

---

## Changeset Content

### For `@fluidframework/shared-object-base`:
```markdown
---
"@fluidframework/shared-object-base": major
---

SharedObject, SharedObjectCore, ISharedObject, ISharedObjectEvents, createSharedObjectKind, and ISharedObjectKind are now internal

These APIs are intended for internal Fluid Framework use only. External implementations
of custom DDSes are not supported. These exports have been moved to internal and are
no longer available in the public API.

Applications should use SharedTree or another existing DDS type (SharedMap, SharedCell, etc.)
rather than implementing custom DDSes. The `SharedObjectKind` type remains public as the
safe, sealed type for referencing DDS kinds.
```

### For `@fluidframework/datastore-definitions`:
```markdown
---
"@fluidframework/datastore-definitions": major
---

IChannel, IChannelFactory, IChannelServices, IChannelStorageService, IDeltaConnection, IDeltaHandler, and IChannelAttributes are now internal

These interfaces are intended for internal Fluid Framework use only. External
implementations of channels/DDSes are not supported. These exports have been moved
to internal and are no longer available in the public API.
```

---

## Verification Plan

1. **Build**: `pnpm build` - Ensure all packages compile and use tooling to discover type exposure issues
2. **Tests**: `pnpm test` - Ensure no test regressions
3. **API Reports**: Verify internal types no longer appear in public API reports
4. **Lint**: `pnpm lint` - Ensure no lint errors
5. **Cross-package**: Verify no public packages depend on these types in their public APIs

---

## Summary

- **No external DDSes found** - All 20 DDSes are already Fluid-owned
- **Direct internal approach**: Move types to internal rather than deprecate-then-remove
- **Safe API preserved**: `SharedObjectKind<T>` remains public and @sealed
- **SharedTree promoted**: Deprecation messages should recommend SharedTree as the primary DDS
- **Datastore layer concern**: IChannel exposure at datastore layer needs special handling
- **Open question**: Need to confirm whether there are other partner DDSes that are not yet accounted for

---

## Follow-up Items

### IFluidDataStoreRuntime Cleanup (Out of Scope)

The current plan keeps `IChannel` and its transitive dependencies (`IChannelServices`, `IChannelStorageService`, `IDeltaConnection`, `IDeltaHandler`) as `@legacy @beta` because they are referenced by `IFluidDataStoreRuntime`. This leaks internal implementation details.

**Follow-up work should be tracked separately to:**
1. Update `IFluidDataStoreRuntime.getChannel()` and `createChannel()` to return a narrower type (e.g., `IFluidLoadable & { id: string }` or `unknown`)
2. Potentially add type check/narrowing functions to each DDS package
3. Once `IFluidDataStoreRuntime` no longer references `IChannel`, fully internalize `IChannel` and all related interfaces

This is intentionally out of scope for the initial custom DDS removal effort to limit the breaking change surface area.

---

## Notes from PR Review

- Per @anthony-murphy: Aggressively deprecate/internalize anything no longer needed - IChannelAttributes, IChannelServices and child types
- Per @anthony-murphy: IChannel has exposure at datastore layer, need plan to sever typing when internal
- Per @anthony-murphy: Prefer making things internal directly and using build tooling to discover problems
- Per @markfields: Another goal is enabling faster iteration on these types
- Per @markfields: Include experimental SharedTree in the DDS list
- Per @markfields: Promote SharedTree specifically in migration guidance
