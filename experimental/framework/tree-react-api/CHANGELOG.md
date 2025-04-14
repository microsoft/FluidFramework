# @fluid-experimental/tree-react-api

## 2.32.0

Dependency updates only.

## 2.31.0

### Minor Changes

- Simplify experimental tree data object implementation ([#23943](https://github.com/microsoft/FluidFramework/pull/23943)) [00a56b79b3](https://github.com/microsoft/FluidFramework/commit/00a56b79b3ba517d56bbde4421fee0cdbfe8af95)

  The experimental tree data object in `tree-react-api` has been simplified in a way that is incompatible with its previous version, which used `SharedDirectory` at the root.
  The library now leverages a new data object that uses the `SharedTree` directly at the root.
  In addition to breaking compatibility with existing documents, these changes include some related simplifications to the APIs which are also breaking:

  - Removes the `key` property from the data object configuration.
    This key was used to inform where the SharedTree was parented beneath the root SharedDirectory, so it no longer serves a purpose.
  - Inlined the `ITreeDataObject` interface into `IReactTreeDataObject`.

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

- Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

  Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0
