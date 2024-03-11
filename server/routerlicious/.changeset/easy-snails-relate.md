---
"@fluidframework/server-kafka-orderer": major
"@fluidframework/server-lambdas": major
"@fluidframework/server-memory-orderer": major
"@fluidframework/server-routerlicious": major
"@fluidframework/server-routerlicious-base": major
---

Alfred no longer handles websocket traffic

Removed the websocket component of Alfred and stood it as a new microservice, Nexus. When running locally it will run on port 3002. Clients that have discovery enabled and use deltaStreamUrl need no change as they will automatically connect to Nexus. If support for older clients is necessary, an Nginx redirect for Alfred socket requests to be forwarded to Nexus can be used.
