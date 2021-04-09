# @fluid-internal/server-gateway

## What is Gateway?
Gateway is an example host. It's a simple service that deploys a controller with a Fluid Framework loader and the necessary drivers to connect to
Routerlicious.

Historically, Gateway was used internally to test the Fluid Framework.

## Testing changes under Gateway with other services running separately

Prior to running locally, the .env file needs to be created and filled out. Please see sample.env to find the fields to configure.

1. From ```./server/``` directory, run ```docker-compose up```. You may see some errors here, such as MongoDB port is not found. This is fine, Gateway doesn't need these services.
2. From ```./server/gateway``` directory, run ```docker-compose build```.
3. Then, in the same directory, run ```docker-compose -f docker-compose.server.yml up```. After a stream of messages, the output should settle on:
```info: Listening on port 3000```
4. Anytime you make changes to the server/client code, on the terminal running the command from step 3, simply quit out and repeat steps 2 & 3.

### Server-side Secrets for ODSP Driver

NOTE: If you are using any gateway routers that use the ODSP driver, i.e. "spo-df", "spo", and "spo-shared", you will need the appropriate client IDs and secrets locally available in your .env file. Please add them in here and NOT in config.json.
Config.json is a file that is pushed to git and we DO NOT want these secrets pushed with any changes. Please only set the client IDs and secrets in the .env file which has already been added to .gitignore.


## Testing changes under gateway

In addition to the standard install/build, also:
* Run install and build under gateway (running build from a parent dir doesn't build gateway)
* Compose a local instance of gateway in Docker
*
````bash
# From FluidFramework/server/gateway
docker-compose build
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

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
