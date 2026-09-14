# @fluidframework/tree-agent-langchain

## 3.0.0

### Minor Changes

- Removal of direct CommonJS support ([#28124](https://github.com/microsoft/FluidFramework/pull/28124)) [0f84e3b8878](https://github.com/microsoft/FluidFramework/commit/0f84e3b8878a5e75b2253976d98fd963bbd9db88)

  Direct `require()` import is no longer directly supported.
  Package is transpiled as ECMAScript Module.

  See [Removal of direct CommonJS support in v3.0](https://github.com/microsoft/FluidFramework/issues/27444) for more information.

- Require modern TypeScript module resolution ([#27970](https://github.com/microsoft/FluidFramework/pull/27970)) [325e2016ca9](https://github.com/microsoft/FluidFramework/commit/325e2016ca9978d4a1f7552c97ba34feac9df41f)

  Fluid Framework Client packages no longer include type declaration compatibility entrypoints for TypeScript's legacy Node10 resolution mode (`"moduleResolution": "node"` or `"node10"`).
  Applications upgrading to Fluid Framework 3.0 must use one of the following supported configurations:
  - `"module": "Node16"` with `"moduleResolution": "Node16"`
  - `"module": "NodeNext"` with `"moduleResolution": "NodeNext"`
  - `"module": "ESNext"` with `"moduleResolution": "Bundler"`

  Existing public package entrypoints exposed through `package.json` exports, including `/alpha`, `/beta`, and `/legacy`, remain available under supported module resolution modes.

  See [Removal of Node10 resolutions in v3.0](https://github.com/microsoft/FluidFramework/issues/27457) for more information.

- Client packages now target ES2022 ([#27846](https://github.com/microsoft/FluidFramework/pull/27846)) [91c78541bdd](https://github.com/microsoft/FluidFramework/commit/91c78541bddcbca5d6c5f357b023eeaee617d885)

  The TypeScript compilation `target` and `lib` for the Fluid Framework client packages have been raised from ES2021/ES2020 to **ES2022**.
  The published JavaScript now uses ES2022 language features (with correspondingly less down-leveling), so consuming these packages requires a runtime that supports ES2022.
  All actively supported Node.js versions and evergreen browsers already meet this requirement.

  Note that Fluid Framework has not officially supported targets older than ES2022 since before 2.0: this is documented in [ClientRequirements.md](https://github.com/microsoft/FluidFramework/blob/main/ClientRequirements.md) as well as the README for every client package.

  It is possible this change could impact users of less up to date JavaScript runtimes.
  Impacted users can use a tool like [babel](https://babeljs.io/) to transpile out unsupported language features.

- Build with TypeScript 6 ([#28052](https://github.com/microsoft/FluidFramework/pull/28052)) [7ab015c49de](https://github.com/microsoft/FluidFramework/commit/7ab015c49deec84833cdfe1fb5e1606b901f6e81)

  FluidFramework Client SDK is now built using TypeScript 6. Consumers should build with TypeScript v6 or v7 or compatible tooling.

## 2.116.0

Dependency updates only.

## 2.115.0

### Minor Changes

- Removes legacy tree-agent APIs ([#27868](https://github.com/microsoft/FluidFramework/pull/27868)) [d889463b3a](https://github.com/microsoft/FluidFramework/commit/d889463b3a45d1f5cd713f2ef91471fbf9b15177)

  The legacy stateful `SharedTreeSemanticAgent` API and its associated `SharedTreeChatModel.query`,
  `SharedTreeChatModel.appendContext`, `SharedTreeChatQuery`, and `SemanticAgentOptions` APIs have
  been removed. Use [`createTreeAgent`](https://fluidframework.com/docs/api/tree-agent/#createtreeagent-function)
  for stateful conversations or
  [`executeSemanticEditing`](https://fluidframework.com/docs/api/tree-agent/#executesemanticediting-function)
  for one-shot edits. `SharedTreeChatModel.invoke` is now required, and the legacy-only
  `disabledError` and `expiredError` variants have been removed from `EditResult`.

  The deprecated `createLegacyLangchainChatModel` adapter has also been removed. Use
  [`createLangchainChatModel`](https://fluidframework.com/docs/api/tree-agent-langchain/#createlangchainchatmodel-function)
  with `createTreeAgent` or `executeSemanticEditing` instead.

## 2.114.0

Dependency updates only.

## 2.113.0

Dependency updates only.

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

Dependency updates only.

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

Dependency updates only.

## 2.63.0

Initial release.
