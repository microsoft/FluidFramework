---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Performance enhancements in Shared Tree

SharedTree leverages the "op bunching" feature where contiguous ops in a grouped batch are bunched and processed together
to asymptotically improve the performance of processing ops.
This performance enhancement focuses on the scenario where there are one or more commits in the trunk and one or more peer
commits are received in a bunch. With 1 trunk commits and 10 peer commits, the performance increases by 57%; with 100
trunk commits and 100 peer commits, the performance increases by 97%.

A couple of example scenarios where the performance will be improved:

- A client makes some local changes and another client simultaneously makes a large number of changes in a single JS turn.
For example, a client is typing into a canvas while another clients copy pastes a table.

- A client makes a local branch with some changes and rebases it into the trunk. For example, AI agents makes changes
on locally which are accepted by a user resulting in the AI's branch merged into the trunk.
