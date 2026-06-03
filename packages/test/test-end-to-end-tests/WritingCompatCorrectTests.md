# Writing Compat-Correct Tests

This document explains how to write Fluid Framework end-to-end tests that correctly exercise compatibility across versions. Tests that bypass these patterns may silently pass under the current version and break when run against older or cross-client compat configurations.

If you arrived here from an ESLint `@typescript-eslint/no-restricted-imports` error — typically of the form
_"`'@fluidframework/<pkg>/internal'` import is restricted from being used by a pattern. Rather than import this Fluid package directly, use the 'apis' argument of describeCompat."_
or _"`<Name>` import from `'@fluidframework/<pkg>/internal'` is restricted from being used by a pattern. Use `apis.<layer>.<Name>` from describeCompat instead."_ — this is the doc to read.

## Why this matters

`describeCompat` parameterizes a test suite over a **compatibility matrix**: the same test runs against many combinations of Loader / Container Runtime / Data Runtime / DDS package versions. This includes **cross-client compat** configs, where the client that *creates* a container runs a different version of these layers than the client that *loads* it. The matrix is what catches version-skew bugs before they reach production.

It only works if the test uses the **version-aware factories and classes** that `describeCompat` supplies via its `apis` argument. A statically imported `SharedMap`, for example, is pinned to the current version — so a test that uses it silently exercises only the current version, whatever config the matrix selects.

For background, see [test-version-utils's README.md](../test-version-utils/README.md) and [Compatibility.md](../../../docs/content/docs/deep/compatibility.md).

## Using `apis`

`describeCompat`'s callback receives `apis` as its second argument. **Use it for every value reference to a compat-versioned type** — never import these statically.

A typical e2e test **creates** containers and (optionally) **loads** them. In a cross-client compat config those two operations run different versions, so `apis` carries a separate set of APIs for each. The single rule that keeps a test compat-correct is:

**Rule:** Build create-time objects from the create-side APIs, and load-time objects from the load-side APIs.

The test infrastructure already applies it to everything it owns: `provider.makeTestContainer(...)` wires up the loader, driver, and other internal plumbing from the create-side versions, and `provider.loadTestContainer(...)` wires them up from the load-side versions. **The only thing left to you is the objects you construct and pass in yourself** — DDS and their factories, data object facttory, conatainer runtime factory, custom loader, etc.

Each create-side layer has a `…ForLoading` counterpart for the load side:

| Create-side | Load-side |
|---|---|
| `apis.dds` | `apis.ddsForLoading` |
| `apis.dataRuntime` | `apis.dataRuntimeForLoading` |
| `apis.containerRuntime` | `apis.containerRuntimeForLoading` |
| `apis.loader` | `apis.loaderForLoading` |
| `apis.driver` | `apis.driverForLoading` |

Both sides are always present, so reference them directly. Destructure what you need at the top of the callback so the rest of the test body reads naturally.

`apis.<layer-name>.packages.<package-name>` (package names are unscoped and camelCased) holds less common exports such as helper functions and constants — e.g. `apis.dataRuntime.packages.sequence`.

### ❌ Static import — DON'T

```ts
import { SharedString, createOverlappingIntervalsIndex } from "@fluidframework/sequence";

const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    [["sharedString", SharedString.getFactory()]],
};

describeCompat("SharedString", "FullCompat", (getTestObjectProvider) => {
    it("supports collaborative text", async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
        const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
        const overlapping = createOverlappingIntervalsIndex(sharedString1);
    });
});
```

The factory registered in `testContainerConfig` is fixed to the current version even when the compat matrix tries to run this test against an older Data Runtime. The test silently passes against a version it didn't actually exercise.

### ✅ Through `apis` — DO

```ts
describeCompat("SharedString", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedString } = apis.dds;
    const { createOverlappingIntervalsIndex } = apis.dataRuntime.packages.sequence;

    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        [["sharedString", SharedString.getFactory()]],
    };

    it("supports collaborative text", async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig);
        const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
        const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
        const overlapping = createOverlappingIntervalsIndex(sharedString1);
    });
});
```

### DDS factories in a registry

```ts
describeCompat("Map test", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedMap } = apis.dds;
    const registry: ChannelFactoryRegistry = [["map", SharedMap.getFactory()]];
    // ...
});
```

### Extending a DataObject

```ts
describeCompat("Custom data object", "FullCompat", (getTestObjectProvider, apis) => {
    const { DataObject, DataObjectFactory } = apis.dataRuntime;

    class MyDataObject extends DataObject {
        protected async initializingFirstTime(): Promise<void> {
            // ...
        }
    }

    const factory = new DataObjectFactory({ type: "my-data-object", ctor: MyDataObject });
    // ...
});
```

### Building a container runtime factory

```ts
describeCompat("Runtime factory test", "FullCompat", (getTestObjectProvider, apis) => {
    const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
    const { DataObject, DataObjectFactory } = apis.dataRuntime;

    // ... build dataObjectFactory ...

    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
        defaultFactory: dataObjectFactory,
        registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
    });
});
```

### Creating a Loader

```ts
describeCompat("Loader test", "NoCompat", (getTestObjectProvider, apis) => {
    const { Loader } = apis.loader;
    const provider = getTestObjectProvider();
    const loader = new Loader({
        urlResolver: provider.urlResolver,
        documentServiceFactory: provider.documentServiceFactory,
        codeLoader: /* ... */,
    });
});
```

### SharedTree schema and tree utilities

`SchemaFactory`, `TreeViewConfiguration`, and `configuredSharedTree` are exported through `apis.dataRuntime.packages.tree`. The default `SharedTree` factory is available as `apis.dds.SharedTree`, but most tests need `configuredSharedTree` so they can opt into specific behavior (shared branches, identifier handling, etc.). The returned object is a drop-in replacement for `SharedTree` and stays compat-versioned because `configuredSharedTree` itself is reached through `apis`:

```ts
describeCompat("Tree test", "FullCompat", (getTestObjectProvider, apis) => {
    const { SchemaFactory, TreeViewConfiguration, configuredSharedTree } =
        apis.dataRuntime.packages.tree;

    const SharedTree = configuredSharedTree({
        healUnresolvableIdentifiersOnDecode: false,
        enableSharedBranches: true,
    });

    const sf = new SchemaFactory("test");
    class Root extends sf.object("Root", { id: sf.identifier }) {}
    const treeConfig = new TreeViewConfiguration({ schema: Root });
    // Register SharedTree.getFactory() in your data store / channel registry as usual.
});
```

### Creating and loading containers

```ts
describeCompat("Map", "FullCompat", (getTestObjectProvider, apis) => {
    const dds = apis.dds;            // create-side
    const ddsForLoading = apis.ddsForLoading;  // load-side

    const createRegistry: ChannelFactoryRegistry = [["map", dds.SharedMap.getFactory()]];
    const loadRegistry: ChannelFactoryRegistry = [
        ["map", ddsForLoading.SharedMap.getFactory()],
    ];

    const createContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry: createRegistry,
    };
    const loadContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry: loadRegistry,
    };

    it("syncs the map", async () => {
        const provider = getTestObjectProvider();
        const container1 = await provider.makeTestContainer(createContainerConfig);   // CREATE — create-side factory
        const container2 = await provider.loadTestContainer(loadContainerConfig);     // LOAD  — load-side factory
        // ...
    });
});
```

### Two `Loader` instances

For tests that drive the lifecycle directly with `provider.makeTestLoader(...)` and `loader.resolve(...)` rather than `make/loadTestContainer`:

```ts
describeCompat("Attach lifecycle", "FullCompat", (getTestObjectProvider, apis) => {
    const SharedString = apis.dds.SharedString;                      // create-side
    const SharedStringForLoading = apis.ddsForLoading.SharedString;  // load-side

    it("survives attach order permutations", async () => {
        const provider = getTestObjectProvider();
        const createRegistry: [string | undefined, IChannelFactory][] = [
            ["sharedString", SharedString.getFactory()],
        ];
        const loadRegistry: [string | undefined, IChannelFactory][] = [
            ["sharedString", SharedStringForLoading.getFactory()],
        ];
        const createSideLoader = provider.makeTestLoader({ registry: createRegistry });
        const loadSideLoader = provider.makeTestLoader({ registry: loadRegistry });

        const container1 = await createSideLoader.createDetachedContainer(...) // Create - create-side loader
        const container2 = await loadSideLoader.resolve({ url: ... })          // LOAD  — load-side loader
    });
});
```

## Handling recently-added APIs

Some `apis.dds.*` entries (for example, `SharedArray`, `SharedSignal`, and `SharedTree`) — and the matching `apis.dataRuntime.packages.*` packages — may be undefined when running against older compat versions whose Data Runtime didn't expose them.

When this happens, **skip the config** — don't fabricate the API for versions that never had it. In a `beforeEach`, check whether the object you need is present on **both** the create-side and load-side APIs, and `skip()` if either is missing. Because this checks for the API directly, the test runs in exactly the compat modes where it exists. See [`treeCompat.spec.ts`](./src/test/treeCompat.spec.ts) for the established pattern:

```ts
describeCompat("My SharedTree compat test", "FullCompat", (getTestObjectProvider, apis) => {
    beforeEach(function () {
        // SharedTree was added in version 2.0.0; older versions don't expose the tree package.
        // Skip if either the create-side or load-side APIs lack it.
        if (
            apis.dataRuntime.packages.tree === undefined ||
            apis.dataRuntimeForLoading.packages.tree === undefined
        ) {
            this.skip();
        }
    });

    // The test body can now safely assume apis.dds.SharedTree / apis.dataRuntime.packages.tree.* exist.
});
```

### Type-only references

If your code needs to refer to a DDS's type (e.g. to annotate the type of a variable or function parameter), use `import type` freely — it has no runtime effect and the lint rule allows it:

```ts
import type { ISharedMap, SharedDirectory } from "@fluidframework/map/internal";
import type { SharedString } from "@fluidframework/sequence";
import type { TreeView } from "@fluidframework/tree";

function insert(str: SharedString): void {
    str.insertText(0, "hello");
}

describeCompat("Map", "FullCompat", (getTestObjectProvider, apis) => {
    const { SharedDirectory } = apis.dds;  // value comes from apis
    // The `SharedDirectory` type-import above is fine — both names coexist in different namespaces.
});
```

## The lint rule

This package's [`eslint.config.mts`](./eslint.config.mts) enforces the patterns above via `@typescript-eslint/no-restricted-imports`. Two kinds of restriction:

- **Blanket** — every value export from the package must go through `apis`. For example, importing `SharedMap` from `@fluidframework/map` (or `@fluidframework/map/internal`) is restricted.

- **Targeted** (`importNames`) — only specific exports are compat-versioned; the rest are free to import directly. For example, from `@fluidframework/aqueduct`, only `DataObject`, `DataObjectFactory`, `BaseContainerRuntimeFactory` and `ContainerRuntimeFactoryWithDefaultDataStore` are restricted.

**Type-only imports are always allowed** (`allowTypeImports: true`). If you only need a name for type annotations, convert to `import type { X } from "..."` and you're done.

**Exempt directories** (no enforcement):

- `src/test/benchmark/**` — benchmarks measure the current version's performance.
- `src/test/migration-shim/**` — these tests intentionally target the current new `SharedTree` (the migration destination).

## Overriding the lint rule

The lint rule allows targeted overrides via `eslint-disable` with a comment explaining intent. The convention is one-line `eslint-disable-next-line` immediately above the import, prefaced by a short reason. Cases where this is appropriate:

- **Migration target imports** — when the test specifically tests migration to (or compat with) the *current* version's API and substituting an older version would defeat the test. See [`migration-shim/`](./src/test/migration-shim) for the directory-level exemption.
- **Tests of compat infrastructure itself** — e.g., [`layerCompat.spec.ts`](./src/test/layerCompat.spec.ts) imports `dataStoreCompatDetailsForRuntime` directly because the layer-compat plumbing is what's under test.

For multi-line imports, use a block disable:

```ts
/* eslint-disable @typescript-eslint/no-restricted-imports */
import {
    SomeName,
    AnotherName,
} from "@fluidframework/aqueduct/internal";
/* eslint-enable @typescript-eslint/no-restricted-imports */
```

Always include a `//` or `/* */` comment above the disable explaining **why**.

## Quick checklist

- [ ] Did I touch a value import from a compat-versioned package? → Use `apis.*`.
- [ ] Did I only need it for type annotation? → `import type { ... }` is fine.
- [ ] Does the test both create and load containers? → Two configs (`createContainerConfig` + `loadContainerConfig`) with `apis.dds` and `apis.ddsForLoading`.
- [ ] Does the test use a recently-added API? → `skip()` in `beforeEach` when it's absent on the create-side **or** load-side APIs.
- [ ] Adding an `eslint-disable`? → One-line reason comment above it, or block disable for multi-line imports.
