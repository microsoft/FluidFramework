# @fluidframework/tree-agent-langchain

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
