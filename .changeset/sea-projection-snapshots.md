---
"@fluidframework/sea-driver": minor
"__section": fix
"__includeInReleaseNotes": false
---
Load SEA Fluid snapshots without downloading earlier history

The Fluid adapter persists versioned sequence and membership projection state with each snapshot and restores it before reading the suffix.
Snapshots from the previous experimental format are rejected instead of replaying their history.
