---
"fluid-framework": minor
---

API tightening

The Fluid Framework API has been clarified with tags applied to package exports. As we are working toward a clear, safe,
and stable API surface, some build settings and imports may need to be adjusted.

**Now:** Most packages are specifying "exports" - import specifierss like` @fluidframework/foo/lib/internals` will
become build errors. The fix is to use only public APIs from @fluidframework/foo.

**Coming soon:** Build resolutions (`moduleResolution` in tsconfig compilerOptions) will need to be resolved with
Node16, NodeNext, or a bundler that supports resolution of named import/export paths. Internally, some FF packages will
use `@fluidframework/foo/internal` import paths that allow packages to talk to each other using non-public APIs.

**Final stage:** APIs that are not tagged @public will be removed from @fluidframework/foo imports.
