---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

The ContainerRuntime class is now deprecated

The class `ContainerRuntime` is deprecated and will no longer be exported starting in version 2.20.0.

There are two possible migration paths to stop using `ContainerRuntime`:

* When using it as a type, replace it with an interface like `IContainerRuntime` (or in rare cases, `IRuntime`)
* When using the static function `ContainerRuntime.loadRuntime` replace it with the free function `loadContainerRuntime`.

`BaseContainerRuntimeFactory` has some changes as well, since it exposed `ContainerRuntime` in several function signatures:

* `instantiateFirstTime` - Takes the wider type `IContainerRuntime` instead of `ContainerRuntime`
* `instantiateFromExisting` - Takes the wider type `IContainerRuntime` instead of `ContainerRuntime`
* `preInitialize` - deprecated as well, since it returns `ContainerRuntime`

These functions should never be called directly anyway - use `BaseContainerRuntimeFactory.instantiateRuntime` instead.
