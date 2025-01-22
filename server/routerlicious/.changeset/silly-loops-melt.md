---
"@fluidframework/server-lambdas": major
"@fluidframework/server-lambdas-driver": major
"@fluidframework/server-memory-orderer": major
"@fluidframework/server-routerlicious": major
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services": major
"@fluidframework/server-services-client": major
"@fluidframework/server-services-core": major
"@fluidframework/server-services-ordering-kafkanode": major
"@fluidframework/server-services-ordering-zookeeper": major
"@fluidframework/server-services-shared": major
"@fluidframework/server-services-utils": major
"@fluidframework/server-test-utils": major
"tinylicious": major
---

Types altered to account for undefined and null values

Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.
