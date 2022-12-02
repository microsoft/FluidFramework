# @fluidframework/azure-local-service

Azure local service is a minimal, self-contained, test implementation of the Azure Fluid Relay service that can be run locally and used for development/testing Fluid functionality in conjunction with the `AzureClient` in local mode.

## What is this for?

The Azure local service includes most of the basic features needed to **test** data stores and containers. While we use the [Webpack Fluid Loader](../../packages/tools/webpack-fluid-loader)'s in browser service for much of our data store and container development, the Azure local service offers some advantages because it's a standalone process. For instance, testing a Fluid container from 2+ simultaneously connected clients is much easier using the Azure local service.

## Getting Started

You can install, build, and start this service by running the following

```sh
npm i
npm run build
npm run start
```

## Configuration

### Port

The Azure local service uses port 7070 by default. You can change the port number by setting an environment
variable named PORT to the desired number. For example:

```sh
$env:PORT=6502
npm run start
```

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

## Contribution Guidelines

Please refer to our [Github Wiki](https://github.com/microsoft/FluidFramework/wiki/Contributing) for an overview of our contribution guidelines.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

## Help

Not finding what you're looking for in this README?
Check out our [GitHub Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).
Thank you!

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- AUTO-GENERATED-CONTENT:END -->
