# @fluidframework/id-compressor

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

Dependency updates only.

## 2.0.0-rc.3.0.0

### Major Changes

-   Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**

## 2.0.0-rc.2.0.0

### Minor Changes

-   id-compressor: Deprecated ID compressor class has been removed from the public API. ([#19054](https://github.com/microsoft/FluidFramework/issues/19054)) [46a05617b2](https://github.com/microsoft/FluidFramework/commits/46a05617b2a42bf2763e49e4ccddd3ee8df9c05d)

    This change should be a no-op for consumers, as there were already better static creation/deserialization functions for use and compressor types are generally unused outside the runtime.

## 2.0.0-rc.1.0.0

### Minor Changes

-   id-compressor: Cluster allocation strategy updated ([#19066](https://github.com/microsoft/FluidFramework/issues/19066)) [0c36eb5f53](https://github.com/microsoft/FluidFramework/commits/0c36eb5f539362a8e27982e831a3ffe7999c1478)

    This change adjusts the cluster allocation strategy for ghost sessions to exactly fill the cluster instead of needlessly allocating a large cluster.
    It will also not make a cluster at all if IDs are not allocated.
    This change adjusts a computation performed at a consensus point, and thus breaks any sessions collaborating across version numbers.
    The version for the serialized format has been bumped to 2.0, and 1.0 documents will fail to load with the following error:
    IdCompressor version 1.0 is no longer supported.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0
