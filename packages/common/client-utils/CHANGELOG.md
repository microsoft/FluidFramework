# @fluid-internal/client-utils

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Minor Changes

-   client-utils: Internal buffer encoding helpers now require 'utf8', 'utf-8', or 'base64' [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Previously, the buffer encoding helpers 'Uint8ArrayToString', 'bufferToString', and 'IsoBuffer.toString' would accept a string argument, which was overly permissive.

    The type of the 'encoding' argument has been narrow to just the supported values 'utf8', 'utf-8', or 'base64'.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0
