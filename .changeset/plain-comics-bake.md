---
"@fluidframework/tree": minor
"__section": tree
---

Fixed incremental summary bug in SharedTree that may cause repeated summary failures eventually leading to document corruption

Incremental summary for SharedTree is off by default. This bug only affects applications that have explicitly enabled incremental summarization.

**Affected configurations**

A session could be affected if all the following were true:

- Incremental summarization was enabled (opt-in feature, off by default).
- The SharedTree schema had incremental fields nested at least 2 levels deep. For example, a map field marked with `incrementalSummaryHint` that contains objects which themselves have a map field also marked with `incrementalSummaryHint`.
- The document was summarized multiple times, with the outer incremental field changing in at least one summary while the inner incremental field remained unchanged.

**Symptoms**

Summaries would fail. Depending on the storage service, the error may appear as:

- `TypeError: Cannot read properties of undefined (reading 'trees')` (for example, when using SharePoint storage)

Repeated summary failures can cause a session to accumulate ops without a summary. Once the limit of ops without a summary is reached (~10k), further ops will be rejected, making the document read-only for that session.

**Mitigation and recovery**

- If a session is already affected, turning off incremental summarization will allow summaries to succeed again.
- Upgrade to this version to prevent further summary failures.
