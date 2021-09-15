---
title: Working changelog
draft: true # Don't publish this!
description: Explanations of breaking and notable changes go here.  Images should live in docs/static/images.  The contents of this file are moved to a release notes page as parts of building docs for each release.
---

## 0.48 Breaking and notable changes

- [client-api package removed](#client-api-package-removed)
- [MockLogger removed from @fluidframework/test-runtime-utils](#mocklogger-removed-from-fluidframeworktest-runtime-utils)

### client-api package removed
The `@fluid-internal/client-api` package was deprecated in 0.20 and has now been removed.  Usage of this package should be replaced with direct usage of the `Loader`, `FluidDataStoreRuntime`, `ContainerRuntime`, and other supported functionality.

### MockLogger removed from @fluidframework/test-runtime-utils
MockLogger is only used internally, so it's removed from @fluidframework/test-runtime-utils.
