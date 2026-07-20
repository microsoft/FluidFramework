# @fluidframework/tree-agent

## 2.112.0

Dependency updates only.

## 2.111.0

Dependency updates only.

## 2.110.0

Dependency updates only.

## 2.103.0

Dependency updates only.

## 2.102.0

Dependency updates only.

## 2.101.0

### Minor Changes

- Upgrade LangChain dependencies to v1 ([#27259](https://github.com/microsoft/FluidFramework/pull/27259)) [eeebc233c69](https://github.com/microsoft/FluidFramework/commit/eeebc233c692e875fcbf2539fffdcc4f1d28af8b)

  `@fluidframework/tree-agent-langchain` (and the LangChain dev-dependencies on `@fluidframework/tree-agent`) now target the LangChain v1 line:
  - `@langchain/core`: `^0.3.80` → `^1.1.44`
  - `@langchain/anthropic`: `^0.3.24` → `^1.3.28`
  - `@langchain/google-genai`: `^0.2.16` → `^2.1.30`
  - `@langchain/openai`: `^0.6.12` → `^1.4.5`

  LangChain v1 is backward-compatible for the message, tool, and chat-model APIs that `tree-agent-langchain` consumes
  (`BaseChatModel`, `BaseMessage`, `AIMessage` / `HumanMessage` / `SystemMessage` / `ToolMessage`, `tool()`, `bindTools()`).
  No source changes are required for consumers using these APIs.
  The new `contentBlocks` content-block API is opt-in.

  Consumers of `createLangchainChatModel` who currently install `@langchain/core@^0.3` should bump to `@langchain/core@^1.1.43`
  (the lowest version that satisfies the peer ranges of all v1 sibling integrations—`@langchain/google-genai@2.1.30` requires `^1.1.43`).

## 2.100.0

### Minor Changes

- Node 22 is now the minimum supported Node.js version ([#27116](https://github.com/microsoft/FluidFramework/pull/27116)) [e8214d29663](https://github.com/microsoft/FluidFramework/commit/e8214d29663f5ee98d737daed82506a25d8de8d0)

  All Fluid Framework client packages now require Node.js 22 or later. This aligns with the standing Node upgrade policy as Node 20 reaches end-of-life on April 30, 2026.

## 2.93.0

Dependency updates only.

## 2.92.0

Dependency updates only.

## 2.91.0

Dependency updates only.

## 2.90.0

Dependency updates only.

## 2.83.0

Dependency updates only.

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
