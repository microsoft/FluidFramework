---
"__section": other
"__includeInReleaseNotes": false
---
Reduce repeated directory publication work in Sea file storage

Reusing a stored directory avoids waiting for the journal writer and rechecking children whose availability is already guaranteed.
Directory publication reuses one canonical encoding for hashing and persistence without changing content identities or the journal format.