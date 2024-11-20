---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

Deprecate the Loader class and provide alternatives. Also deprecated the IHostLoader interface.

Deprecate the Loader class and IHostLoader interface and provide standalone APIs so the Host does not need to
create a Loader object. Instead it can directly use APIs like `resolveContainer`
, `createDetachedContainer` and `rehydrateDetachedContainerFromSnapshot` in the `@fluidframework/container-loader` package
to achieve the functionalities earlier provided by the Loader class.

Earlier if you were using properties on the loader object for ex. UrlResolver which was supplied at the loader object
creation time, then you need to directly use the passed UrlResolver instead of using it from the loader object. Similar
with other props as well.
