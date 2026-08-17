# Azure-related Fluid packages

## @fluidframework/azure-client

The azure-client package provides a simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay service.

See the [package README](./packages/azure-client/README.md) for more information.

## @fluidframework/azure-local-service

The azure-local-service package provides a minimal, self-contained, test implementation of the Azure Fluid Relay service that can be run locally and used for development/testing Fluid functionality in conjunction with the `AzureClient` in local mode.

See the [package README](./packages/azure-local-service/README.md) for more information.

## @fluidframework/azure-service-utils

A set of helper utilities for building backend APIs for use with Azure Fluid Relay service.

See the [package README](./packages/azure-service-utils/README.md) for more information.

## @fluid-example/app-integration-external-controller

An example application demonstrating how to use the azure-client package.

See the [package README](./packages/external-controller/README.md) for more information.

# Developer notes

## Dependencies

### Adding/updating dependencies

For information on adding and removing dependencies, see [Managing
dependencies](../docs/content/Contributing/Managing-Dependencies.md) in our documentation.

### Dependency overrides

The root package.json of this release group contains the following dependency adjustments/overrides.

```json
"pnpm": {
  "peerDependencyRules": {
    "ignoreMissing": [
      "fluid-framework"
    ]
  }
}
```

Peer dependencies on fluid-framework are never fulfilled since itt's an in-repo dependency; we expect customers to
install it as a dependency when using azure-client, but we don't install it alongside azure-client here in the repo.

# Help

Not finding what you're looking for in this README?
Check out our [developer documentation](../docs/content/Home.md) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](../docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).
Thank you!
