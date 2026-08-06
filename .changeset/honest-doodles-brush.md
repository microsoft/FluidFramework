---
"@fluidframework/tree-agent": minor
"@fluidframework/tree-agent-langchain": minor
"__section": tree
---

Removes legacy tree-agent APIs

The legacy stateful `SharedTreeSemanticAgent` API and its associated `SharedTreeChatModel.query`,
`SharedTreeChatModel.appendContext`, `SharedTreeChatQuery`, and `SemanticAgentOptions` APIs have
been removed. Use `createTreeAgent` for stateful conversations or `executeSemanticEditing` for
one-shot edits. `SharedTreeChatModel.invoke` is now required, and the legacy-only `disabledError`
and `expiredError` variants have been removed from `EditResult`.

The deprecated `createLegacyLangchainChatModel` adapter has also been removed. Use
`createLangchainChatModel` with `createTreeAgent` or `executeSemanticEditing` instead.
