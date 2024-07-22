---
"@fluidframework/server-kafka-orderer": major
"@fluidframework/server-memory-orderer": major
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services-ordering-kafkanode": major
"@fluidframework/server-test-utils": major
---

`.off()` instance method added to IProducer and IOrdererConnection implementations

In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces. All exported implementations of IProducer and IOrdererConnection have had a `.off()` method added, and all functions that take IProducer or IOrdererConnection params have had their types updated as well.
