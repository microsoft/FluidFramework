---
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services-client": major
"@fluidframework/server-services-core": major
"@fluidframework/server-services-shared": major
---

server-services-client: `messageBrokerId` added to `ISession`

The `ISession` interface was updated with new field `messageBrokerId` that would be assigned when message broker is set to Event Hubs.
