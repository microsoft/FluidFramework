# headless-agent
## Headless Agent

Loads Fluid data stores on a headless chromium browser, as opposed to the Node.js runtime.

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

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these
trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/
intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this
project must not cause confusion or imply Microsoft sponsorship.
