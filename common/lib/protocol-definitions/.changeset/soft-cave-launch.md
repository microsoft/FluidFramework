---
"@fluidframework/protocol-definitions": major
---

Remove IDocumentAttributes.term and ISequenceDocumentMessage.term

These members were related to an experimental feature that did not ship. As a result they are unused/ignored by all consumers.
They were deprecated in version 1.2.0, and this change removes them entirely.
