---
"@fluidframework/server-kafka-orderer": major
"@fluidframework/server-lambdas": major
"@fluidframework/server-local-server": major
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services-core": major
"__section": other
---

Cleanup underlying orderer connection when last socket disconnects from a session

When a websocket disconnect occurs in the Nexus lambda, the underlying Orderer (Kafka or Local) connection will be closed and removed if it was the last connection open for a given tenantId/documentId. Various classes and types were updated to enable connection cleanup: added IOrdererManager.removeOrderer, changed KafkaOrdererFactory.delete to return a Promise due to internal orderer connection close, added removeOrderer to OrdererManager and LocalOrdererManager.
