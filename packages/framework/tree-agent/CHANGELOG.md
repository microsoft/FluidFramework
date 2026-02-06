# @fluidframework/tree-agent

## 2.82.0

Dependency updates only.

## 2.81.0

### Minor Changes

- tree-agent: New type factory system for method and property bindings ([#26167](https://github.com/microsoft/FluidFramework/pull/26167)) [f09aa24009](https://github.com/microsoft/FluidFramework/commit/f09aa24009635284852e07f126eadb7a7a8c0fdf)

  The `@fluidframework/tree-agent` package now includes a custom type system (Type Factory) as an alternative to Zod for
  defining method and property types. This new system is available in the `/alpha` entry point and provides a familiar
  API for type definitions.

  #### Key features
  - **Familiar API**: Use `tf.string()`, `tf.object()`, etc. - similar to Zod's syntax (where `tf` is aliased from
    `typeFactory`)
  - **Same API surface**: The existing `expose`, `exposeProperty`, and `buildFunc` methods work with both Zod and Type
    Factory types

  #### Usage

  Import from the alpha entry point to use Type Factory types:

  ```typescript
  import {
    typeFactory as tf,
    buildFunc,
    exposeMethodsSymbol,
  } from "@fluidframework/tree-agent/alpha";
  import { SchemaFactory } from "@fluidframework/tree";

  const sf = new SchemaFactory("myApp");

  class TodoList extends sf.object("TodoList", {
    items: sf.array(sf.string),
  }) {
    public addItem(item: string): void {
      this.items.insertAtEnd(item);
    }

    public static [exposeMethodsSymbol](methods) {
      methods.expose(
        TodoList,
        "addItem",
        buildFunc({ returns: tf.void() }, ["item", tf.string()]),
      );
    }
  }
  ```

  #### Available types

  All common types are supported:
  - **Primitives**: `tf.string()`, `tf.number()`, `tf.boolean()`, `tf.void()`, `tf.undefined()`, `tf.null()`,
    `tf.unknown()`
  - **Collections**: `tf.array(elementType)`, `tf.object({ shape })`, `tf.map(keyType, valueType)`,
    `tf.record(keyType, valueType)`, `tf.tuple([types])`
  - **Utilities**: `tf.union([types])`, `tf.literal(value)`, `tf.optional(type)`, `tf.readonly(type)`
  - **Schema references**: `tf.instanceOf(SchemaClass)`

  #### Migration from Zod

  You can migrate gradually - both Zod and Type Factory types work in the same codebase:

  **Before (Zod):**

  ```typescript
  import { z } from "zod";
  import { buildFunc, exposeMethodsSymbol } from "@fluidframework/tree-agent";

  methods.expose(
    MyClass,
    "myMethod",
    buildFunc({ returns: z.string() }, ["param", z.number()]),
  );
  ```

  **After (Type Factory):**

  ```typescript
  import {
    typeFactory as tf,
    buildFunc,
    exposeMethodsSymbol,
  } from "@fluidframework/tree-agent/alpha";

  methods.expose(
    MyClass,
    "myMethod",
    buildFunc({ returns: tf.string() }, ["param", tf.number()]),
  );
  ```

  #### Note on type safety

  The Type Factory type system does not currently provide compile-time type checking, though this may be added in the
  future. For applications requiring strict compile-time validation, Zod types remain fully supported.

## 2.80.0

Dependency updates only.

## 2.74.0

Dependency updates only.

## 2.73.0

Dependency updates only.

## 2.72.0

Dependency updates only.

## 2.71.0

Dependency updates only.

## 2.70.0

### Minor Changes

- A minimal set of branching APIs has been promoted to beta. ([#25744](https://github.com/microsoft/FluidFramework/pull/25744)) [32cc2c75d8](https://github.com/microsoft/FluidFramework/commit/32cc2c75d82c35403caa91e67e81f71baee5d092)

  The following APIs have been promoted to beta in `@fluidframework/tree`:
  - `TreeBranch.fork()`
  - `TreeBranch.merge()`
  - `TreeBranch.rebaseOnto()`
  - `TreeBranch.dispose()`
  - `TreeView.fork()`

  These APIs enable applications to implement basic local branching flows.

## 2.63.0

Dependency updates only.

## 2.62.0

Dependency updates only.

## 2.61.0

Dependency updates only.

## 2.60.0

Dependency updates only.

## 2.53.0
