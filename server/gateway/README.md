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

NOTE: If you are using any gateway routers that use the ODSP driver, i.e. "spo", "spo-*", you will need the appropriate client IDs and secrets locally available in your .env file. Please add them in here and NOT in config.json. A sample.env file has been provided as a template for the values you may need in your .env file. Please copy this to a file called ".env" for the values in it to be picked up.
Config.json is a file that is pushed to git and we DO NOT want these secrets pushed with any changes. Please only set the client IDs and secrets in the .env file which has already been added to .gitignore.

## Custom tenants

You can also use Gateway with your own custom test tenant instead of using the 1P Microsoft tenant. This gives you greater flexibilty with authentication, setting up custom app catalogs, defining test shared sites and drives, etc. To start using your test tenant, simply fill out the SP_SITE and SP_ISSUER values in your .env file. SP_SITE corresponds to the Sharepoint site name assigned to your tenant and will be the hostname for it. To get the SP_ISSUER, if you do not already know it, please try running Gateway without adding the value in and accessing any custom tenant path. You will face an error that will provide you the issuer value it was trying to find. Simply copy this value into the .env file, rebuild, and restart Gateway now.

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

## Test URLs for Gateway

The following are example URLs that you can use to test different Gateway paths:

For Microsoft tenant w/ Auspkn & Personal Drive:
Template: http://localhost:3000/loader/spo/{FILE-NAME}?chaincode={FLUID-PACKAGE-NAME}@{FLUID-PACKAGE-VERSION}
Example: http://localhost:3000/loader/spo/GatewayTest?chaincode=@fluid-example/diceroller@^0.24.0

For Microsoft DF tenant w/ Auspkn & Personal Drive:
Template: http://localhost:3000/loader/spo-df/{FILE-NAME}?chaincode={FLUID-PACKAGE-NAME}@{FLUID-PACKAGE-VERSION}
Example: http://localhost:3000/loader/spo-df/GatewayTest?chaincode=@fluid-example/diceroller@^0.24.0

For Microsft tenant w/ Auspkn & Shared Drive:
Template: http://localhost:3000/loader/spo-shared/{FILE-NAME}?chaincode={FLUID-PACKAGE-NAME}@{FLUID-PACKAGE-VERSION}&driveId={SHARED-DRIVE-ID}
Example:  http://localhost:3000/loader/spo-shared/GatewayTest?chaincode=@fluid-example/diceroller@^0.24.0&driveId=b!x8bLUoZUiEOhsAHWwPFMMBc9ruDYatdMp0GUs07BqlZnofre90-8RZ_d_dlfrRlH#

For Custom SP tenants w/ App Catalog & Personal Drive:
Template: http://localhost:3000/loader/spo-custom/{FILE-NAME}?spScriptId={APP-CATALOG-FLUID-SCRIPT-ID}
Example: http://localhost:3000/loader/spo-custom/GatewayTest?spScriptId=928e48eb-c45e-4abe-8868-b87a0dcb4521

For Custom SP tenants w/ App Catalog & Shared Drive:
Template: http://localhost:3000/loader/spo-custom-shared/{FILE-NAME}?driveId={SHARED-DRIVE-ID}&spScriptId={APP-CATALOG-FLUID-SCRIPT-ID}
Example: http://localhost:3000/loader/spo-custom-shared/GatewayTestdasfdsa341212aasdfadsfas?driveId=b!KZqAXPgroUu9jVjD6ziInQBS3I7S-ktAiNToz4MV0-L7yguPDerSTZxNE6fOBuG1&spScriptId=928e48eb-c45e-4abe-8868-b87a0dcb4521

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
