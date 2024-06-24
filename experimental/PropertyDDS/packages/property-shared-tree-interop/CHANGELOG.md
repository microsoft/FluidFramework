# @fluid-experimental/property-shared-tree-interop

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

Dependency updates only.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

### Minor Changes

-   Rename SchemaCollection.treeSchema to nodeSchema ([#18067](https://github.com/microsoft/FluidFramework/issues/18067)) [be7ee4b383](https://github.com/microsoft/FluidFramework/commits/be7ee4b383c86fbcb60e92b606bbd305d0157acb)

    This breaks all existing documents, as well as any users of SchemaCollection.treeSchema.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

### Minor Changes

-   tree2: Rename "Value" Multiplicity and FieldKind ([#17622](https://github.com/microsoft/FluidFramework/issues/17622)) [bb68aeb30c](https://github.com/microsoft/FluidFramework/commits/bb68aeb30cfb3d4e0e82f04f1771ad4cb69e23af)

    `Multiplicity.Value` has been renamed to `Multiplicity.Single` and `FieldKinds.value` has been renamed to `FieldKinds.required`.

## 2.0.0-internal.7.0.0

### Major Changes

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

### Minor Changes

-   tree2: Restrict struct field names to avoid collisions with schema2 names ([#17089](https://github.com/microsoft/FluidFramework/issues/17089)) [8f8294188f](https://github.com/microsoft/FluidFramework/commits/8f8294188f554e6cc708d6cbbde4ea1dd2e52728)

    Struct field names are now restricted to avoid collisions with schema2 names.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

Dependency updates only.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0
