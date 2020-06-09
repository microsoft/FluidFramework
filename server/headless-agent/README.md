# headless-agent

[![Headless Agent Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/19/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=19)

To begin you'll need to connect to the Fluid private npm repository. Instructions can be found [here](../routerlicious/README.md#authorizing-to-private-npm-feed)

## Headless Agent

Loads Fluid components on a headless chromium browser, as opposed to the Node.js runtime.

To build
```
docker build --build-arg NPM_TOKEN=$(echo $NPM_TOKEN) -t headless-agent .
```

And to run
```
docker run --rm -t --cap-add=SYS_ADMIN --network routerlicious_default headless-agent
```

To run locally using cli (defaults to PPE endpoint)
```
node dist/puppeteer/cli.js -d <documentId> -t <agentType>
```
