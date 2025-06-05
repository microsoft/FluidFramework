# @fluid-private/test-dds-utils

## 2.40.0

### Minor Changes

- IFluidHandleInternal.bind has been deprecated ([#24553](https://github.com/microsoft/FluidFramework/pull/24553)) [8a4362a7ed](https://github.com/microsoft/FluidFramework/commit/8a4362a7edef3a97fee13c9d23bea49448ba2a6a)

  Handle binding is an internal concept used to make sure objects attach to the Container graph when their handle is stored in a DDS which is itself attached.
  The source of the "bind" operation has been assumed to be any handle, but only one implementation is actually supported (`SharedObjectHandle`, not exported itself).

  So the `bind` function is now deprecated on the `IFluidHandleInterface`, moving instead to internal types supporting the one valid implementation.
  It's also deprecated on the various exported handle implementations that don't support it (each is either no-op, pass-through, or throwing).

  No replacement is offered, this API was never meant to be called from outside of the Fluid Framework.

## 2.33.0

Dependency updates only.

## 2.32.0

Dependency updates only.

## 2.31.0

Dependency updates only.

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

Dependency updates only.

## 2.0.0-rc.3.0.0

Dependency updates only.

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

- @fluid-internal/test-dds-utils renamed to @fluid-private/test-dds-utils ([#17703](https://github.com/microsoft/FluidFramework/issues/17703)) [5bd40df610](https://github.com/microsoft/FluidFramework/commits/5bd40df61030395879ee8dd212d693f927dbb794)

  The @fluid-internal/test-dds-utils has been renamed to @fluid-private/test-dds-utils. This package is intended for use
  within the Fluid Framework repo and is not published externally.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

Dependency updates only.

## 2.0.0-internal.6.4.0

Dependency updates only.

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

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
