---
"@fluidframework/container-runtime": minor
"__section": fix
---
Fixed a container error when ops are added to a different batch while rebasing

When a batch contains ops that were created while another op was being processed, the batch is "rebased" by resubmitting its ops one at a time. Resubmitting an op could add ops to a different batch than the one being rebased (for example, resubmitting a blob attach op can generate a document schema change op). Those ops were left behind when the flush completed, which closed the container with a `0x3cf` assert.

All batches that require rebasing are now rebased before any batch is flushed, so ops generated during a rebase are always flushed, and blob attach ops are still sent before the ops that reference them.
