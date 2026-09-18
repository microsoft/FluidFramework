---
"@fluidframework/tinylicious-driver": minor
"__section": fix
---
Restore positional Tinylicious URL resolver constructor compatibility

`InsecureTinyliciousUrlResolver` temporarily accepts its former `(port, endpoint)` constructor form again to prevent existing integrations from breaking.
This API remains internal; migrate to the options object form, `{ port, endpoint }`.