---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

The ContainerRuntime class is now deprecated

The class `ContainerRuntime` is deprecated and will no longer be exported starting in version 2.20.0.
Additionally, function signatures on `BaseContainerRuntimeFactory` have been updated from using the type `ContainerRuntime` to using `IContainerRuntime`.

There are two possible migration paths to stop using `ContainerRuntime`:

* When using it as a type, replace it with an interface like `IContainerRuntime` (or in rare cases, `IRuntime`)
* When using the static function `ContainerRuntime.loadRuntime` replace it with the free function `loadContainerRuntime`.
