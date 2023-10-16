---
"@fluidframework/server-services-client": major
---

Use RawAxiosRequestHeaders instead of AxiosRequestHeaders in BasicRestWrapper constructor.

The `BasicRestWrapper` class constructor now uses `RawAxiosRequestHeaders` from the `axios` package instead of `AxiosRequestHeaders`. This applies to both the `defaultHeaders` and `refreshDefaultHeaders` arguments.

This change was made in [#17419](https://github.com/microsoft/FluidFramework/pull/17419).
