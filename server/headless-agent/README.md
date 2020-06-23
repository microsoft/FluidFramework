# headless-agent
## Headless Agent

Loads Fluid components on a headless chromium browser, as opposed to the Node.js runtime.

To build
```
docker build -t headless-agent .
```

And to run
```
docker run --rm -t --cap-add=SYS_ADMIN --network routerlicious_default headless-agent
```

To run locally using cli (defaults to PPE endpoint)
```
node dist/puppeteer/cli.js -d <documentId> -t <agentType>
```
