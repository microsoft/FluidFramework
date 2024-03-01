---
"@fluidframework/container-loader": major
---

IParsedUrl does not accept null version

IParsedUrl previously claimed to accept null version to indicate that we should not load from a snapshot, but this was internally converted into undefined (thereby loading from latest snapshot). The typing has been updated to reflect this reality.
