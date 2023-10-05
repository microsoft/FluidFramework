---
"@fluidframework/build-common": major
---

Strict API-Extractor config now fails on incompatible release tags

This makes [incompatible release tags](https://api-extractor.com/pages/messages/ae-incompatible-release-tags/) a build failure, rather than adding a warning to the generated API reports. This is important, as those warnings generally go unnoticed and unaddressed.

Note: this is a breaking change, as it will cause builds to fail that didn't previously. That said, semantically it just introduces tighter enforcement of existing rules.
