---
"@fluidframework/container-runtime": minor
---
---
"section": "fix"
---
Restored old op processing behavior around batched ops to avoid potential regression

There's a theoretical risk of indeterminate behavior due to a recent change to how batches of ops are processed.
This fix reverses that change.

Pull Request #21785 updated the ContainerRuntime to hold onto the messages in an incoming batch until they've all arrived, and only then process the set of messages.

While the batch is being processed, the DeltaManager and ContainerRuntime's view of the latest sequence numbers will be
out of sync. This may have unintended side effects, so out of an abundance of caution we're reversing this behavior until
we can add the proper protections to ensure the system stays properly in sync.
