---
"@fluidframework/server-services-client": major
---

Use RawAxiosRequestHeaders instead of AxiosRequestHeaders

BasicRestWrapper class contrsuctor now takes input of RawAxiosRequestHeaders for the defaultHeaders argument and refreshDefaultHeaders argument.

This changeset was retroactively added for commit d840deda657ff33a7767933bb796a89ffdf44d90
