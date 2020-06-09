# @microsoft/fluid-server-gateway

## Testing changes under gateway

To begin you'll need to connect to the Fluid private npm repository. Instructions can be found [here](../routerlicious/README.md#authorizing-to-private-npm-feed)

In addition to the standard install/build, also:
* Run install and build under gateway (running build from a parent dir doesn't build gateway)
* Compose a local instance of gateway in Docker
````bash
# From FluidFramework/server/gateway
docker-compose build --build-arg NPM_TOKEN=${NPM_TOKEN}
docker-compose up --no-build
````
You use these two commands over just __docker-compose up__ because just running __up__ does not update the sources served through gateway.
* Edit the __docker-compose.yml__ file for the entry point to point to the local instance of gateway
````
# e.g. FluidFramework/docker-compose.yml
version: '3.4'
services:
    gateway:
        image: gateway_gateway # The name running in Docker
        ports:
            - "3005:3000" # Some other unused port
        ...
    ...
...
````
* Start a local instance of the entry point
````bash
# e.g. from FluidFramework
npm start
````

When making additional changes, stop both gateway and the other entry point and rerun these steps.
