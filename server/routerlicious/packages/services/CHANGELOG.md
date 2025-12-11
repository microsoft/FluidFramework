# @fluidframework/server-services

## 6.0.0

### Major Changes

-   Added healthCheck for mongo database ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Exposed a healthCheck property from MongoManager class, and added a healthCheck method to the MongoDb class.

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   Adds support for the tenant manager to use Riddler's new APIs ([#23379](https://github.com/microsoft/FluidFramework/pull/23379)) [87c92ca185](https://github.com/microsoft/FluidFramework/commit/87c92ca185dcb128553ae183bd6bfc2a6c487c77)

    Now the tenant manager used by Alfred can fetch the new private keys exposed by Riddler. The `getKeys` API can be called with the `usePrivateKeys` flag set to true. This is currently only used for one Alfred to Riddler API call to fetch tenant keys when signing a document creation token.

-   Added Collaboration Session Tracking implementations ([#22381](https://github.com/microsoft/FluidFramework/pull/22381)) [9a932a638b](https://github.com/microsoft/FluidFramework/commit/9a932a638b701ad36fed8fd1b273e63bcb335878)

    Added `CollaborationSessionTracker` implementation of `ICollaborationSessionTracker` and `RedisCollaborationSessionManager` implementation of `ICollaborationSessionManager`. These are used internally within the Nexus lambda to track session information for telemetry purposes.

## 5.0.0

Dependency updates only.

## 4.0.0

Dependency updates only.

## 3.0.0

### Major Changes

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   Updated @fluidframework/common-utils ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-utils dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-utils/CHANGELOG.md#310)
