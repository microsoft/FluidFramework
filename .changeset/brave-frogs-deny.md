---
"@fluidframework/protocol-definitions": minor
---

Deprecate ISequencedDocumentMessage properties "compression" and "expHash1"

The properties have been extracted into a separate interface, "ISequencedDocumentMessageExperimental" and should be used from there instead.
