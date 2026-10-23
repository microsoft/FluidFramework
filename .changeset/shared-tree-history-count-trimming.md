---
"@fluidframework/tree": minor
"__section": fix
---
Fix SharedTree history length tracking during trimming

Reading branch history no longer causes a commit-count assertion when rebasing a branch triggers history trimming.
History lengths are updated with branch mutations and shared ancestry trimming, independently of event listener order.
