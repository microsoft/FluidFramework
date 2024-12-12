---
"@fluidframework/server-lambdas": major
"@fluidframework/server-lambdas-driver": major
"@fluidframework/server-memory-orderer": major
"@fluidframework/server-services-core": major
"@fluidframework/server-services-ordering-rdkafka": major
"@fluidframework/server-test-utils": major
---

Added pause and resume methods for lambdas

Added pause and resume methods for context, documentContext, partition, partitionManager, kakfaRunner, rdKafkaConsumer, and lambda. They are used to pause/resume the incoming messages during various circuitBreaker states.
