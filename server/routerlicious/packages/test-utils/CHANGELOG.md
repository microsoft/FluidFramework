# @fluidframework/server-test-utils

## 6.0.0

### Major Changes

-   Added pause and resume methods for lambdas ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Added pause and resume methods for context, documentContext, partition, partitionManager, kakfaRunner, rdKafkaConsumer, and lambda. They are used to pause/resume the incoming messages during various circuitBreaker states.

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   `.off()` instance method added to IProducer and IOrdererConnection implementations ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces. All exported implementations of IProducer and IOrdererConnection have had a `.off()` method added, and all functions that take IProducer or IOrdererConnection params have had their types updated as well.

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
