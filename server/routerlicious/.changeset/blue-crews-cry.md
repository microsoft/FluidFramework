---
"@fluidframework/server-services-client": major
---

Use RawAxiosRequestHeaders instead of AxiosRequestHeaders in BasicRestWrapper constructor.

The `BasicRestWrapper` class constructor now uses `RawAxiosRequestHeaders` from the `axios` package instead of `AxiosRequestHeaders`. This applies to both the `defaultHeaders` and `refreshDefaultHeaders` arguments.

This changeset was retroactively added for commit `d840deda657ff33a7767933bb796a89ffdf44d90`.
