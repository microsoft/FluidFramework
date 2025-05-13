---
"@fluidframework/server-services-core": major
"__section": feature
---

`.off()` instance method added to IProducer and IOrdererConnection types

In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces.
