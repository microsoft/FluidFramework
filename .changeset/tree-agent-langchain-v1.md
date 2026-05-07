---
"@fluidframework/tree-agent-langchain": minor
"@fluidframework/tree-agent": minor
"__section": tree
---
Upgrade LangChain dependencies to v1

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
