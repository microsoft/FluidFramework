# @fluidframework/location-redirection-utils

Shared utilities for handling location change of container on server.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

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

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
