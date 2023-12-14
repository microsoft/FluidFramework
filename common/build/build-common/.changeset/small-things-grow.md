---
"@fluidframework/build-common": major
---

Upgraded Typescript target to ES2020

Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.
If any app want to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.
