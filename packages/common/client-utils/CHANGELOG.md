# @fluid-internal/client-utils

## 2.30.0

Dependency updates only.

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

### Minor Changes

-   The events library has been moved from the tree package ([#23141](https://github.com/microsoft/FluidFramework/pull/23141)) [cae07b5c8c](https://github.com/microsoft/FluidFramework/commit/cae07b5c8c7904184b5fbf8c677f302da19cc697)

    In previous releases, the `@fluidframework/tree` package contained an internal events library. The events-related types and interfaces have been moved to
    `@fluidframework/core-interfaces`, while the implementation has been relocated to `@fluid-internal/client-utils`. There are
    no changes to how the events library is used; the relocation simply organizes the library into more appropriate
    packages. This change should have no impact on developers using the Fluid Framework.

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

Dependency updates only.

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

Dependency updates only.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Minor Changes

-   client-utils: Internal buffer encoding helpers now require 'utf8', 'utf-8', or 'base64' [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Previously, the buffer encoding helpers 'Uint8ArrayToString', 'bufferToString', and 'IsoBuffer.toString' would accept a string argument, which was overly permissive.

    The type of the 'encoding' argument has been narrow to just the supported values 'utf8', 'utf-8', or 'base64'.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0
