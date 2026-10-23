---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Fix SharedTree history length tracking during trimming

Reading branch history no longer causes a commit-count assertion when rebasing a branch triggers history trimming.
Branch lengths are now directly computed and cached on the branch itself rather than relying on event listening, which is subject to timing issues and interleaving.
Reading a branch's history length after the branch is disposed now throws an error.
