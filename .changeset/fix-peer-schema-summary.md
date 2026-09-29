---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Fix summarization after conflicting schema upgrades

SharedTree can now summarize retained peer history after a schema upgrade and dependent edits are rejected during rebasing.
Previously, this could fail with a "missing node schema" error.
