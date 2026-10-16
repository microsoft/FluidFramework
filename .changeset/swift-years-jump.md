---
"@fluidframework/container-runtime": minor
"__section": fix
---

Keep garbage-collection summary state consistent across retries and delayed acknowledgments

Garbage-collection state now follows the summary proposal that the service acknowledges.
Previously, a newer attempt could replace that proposal's state before its acknowledgment arrived.
Failed attempts and untracked summaries no longer replace the state of submitted proposals.
Full summaries can serve as baselines for later incremental summaries.
An older acknowledgment no longer clears a newer garbage-collection recovery request.
