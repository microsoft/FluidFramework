# @fluidframework/location-redirection-utils

Shared utilities for handling location change of container on server.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

## Explanation of the scenario:

This talks about loading of a container by handling location change of container in the storage. For example, today
the site domain can change for a particular container on server for spo. The host/app does not know about this change
and they request the container using the old domain name and it will cause the container load request to fail. 
`resolveWithLocationRedirectionHandling` utility handles that scenario and use the new absolute url supplied by the
driver when driver sees that error, to make the request again and successfully load the container.


## Usage

The host/apps needs to use this utility when they load the container. The below example tells how to use the utility.
Lets say host has the code to call Loader.resolve(IRequest) or Loader.request(IRequest, pendingLocalState) in their code, now they want to wrap that within this utility if they want to handle this case.

```
const container = await resolveWithLocationRedirectionHandling<IContainer>(
    async (req: IRequest) => {
        // Any other code that you want to execute like extract something info the request/ logging etc. This
        // req is the new request with which loader.resolve will be called.
        loader.resolve(req),
    },
    request, // original request to be resolved
    urlResolver, // urlResolver, same as hosts passes to the loader
    logger, // logger which will help with the telemetry
);

OR

const response = await resolveWithLocationRedirectionHandling<IResponse>(
    async (req: IRequest) => {
        // Any other code that you want to execute like extract something info the request/ logging etc
        loader.request(req, pendingLocalState),
    },
    request, // original request to be resolved
    urlResolver, // urlResolver, same as hosts passes to the loader
    logger, // logger which will help with the telemetry
);
```
