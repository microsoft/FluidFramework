[![Metrics Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/20/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=20)

# Fluid Metrics

Simple service that listens to the Fluid Kafka topics and then exports metrics to Aria

## Building and running

To begin you'll need to connect to the Fluid private npm repository. Instructions can be found [here](../../docs/get-started/package-feed.md)

You can build the production container by running.

`docker build --build-arg NPM_TOKEN=${NPM_TOKEN} -t fluid-metrics .`
