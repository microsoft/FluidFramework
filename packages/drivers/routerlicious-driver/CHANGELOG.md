# @fluidframework/routerlicious-driver

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Server compatibility change: Upload first summary as base64 blob [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    We are updating the client to adjust the behavior of the routerlicious driver during the first summary, which will now allow non-UTF-8 compatible binaries to be submitted. (See [PR #16286](https://github.com/microsoft/FluidFramework/pull/16286) and [PR #16397](https://github.com/microsoft/FluidFramework/pull/16397)). To support this change, it is necessary for the servers to run the latest versions that are prepared to work with this new format.

    This means that this version of routerlicious-driver requires routerlicious server version >=1.0.0.

    When uploading summaries, the SummaryTreeUploadManager and WholeSummaryUploadManager currently use different conversion types based on the content of the ISummaryTree object. If the content is binary, the encoding is base64, and if it comes from a string, the encoding is utf-8. Previously, there was an exception for the first summary, which was always encoded in utf-8. However, recent changes have adjusted the server code to replicate this processing for all summaries. As a result, new clients will need to be run against recent versions of the servers that understand this new format.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
