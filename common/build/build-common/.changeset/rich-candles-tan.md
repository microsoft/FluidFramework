---
"@fluidframework/build-common": minor
---

Strict API-Extractor config now fails on incompatible release tags

This makes incompatible release tags a build failure, rather than adding a warning to the generated API reports.
This is important, as those warnings generally go unnoticed and unaddressed.

Note that while this is technically a breaking change, as it will cause builds to fail that didn't previously,
semantically it just introduces tighter enforcement of existing rules.
Therefore we are treating this as a minor change only.
