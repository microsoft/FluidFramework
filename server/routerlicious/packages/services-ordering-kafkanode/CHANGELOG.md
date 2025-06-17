# @fluidframework/server-services-ordering-kafkanode

## 6.0.0

### Major Changes

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   `.off()` instance method added to IProducer and IOrdererConnection implementations ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces. All exported implementations of IProducer and IOrdererConnection have had a `.off()` method added, and all functions that take IProducer or IOrdererConnection params have had their types updated as well.

## 5.0.0

Dependency updates only.

## 4.0.0

Dependency updates only.

## 3.0.0

Dependency updates only.
