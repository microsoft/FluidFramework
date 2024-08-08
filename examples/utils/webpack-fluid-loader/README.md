# @fluid-example/webpack-fluid-loader

This folder contains the webpack-fluid-loader. This package is meant to be used with the `webpack --serve` and is used by Fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running `webpack --serve` to change the behavior of webpack-fluid-loader.

See the [Azure Fluid Relay](#azure-fluid-relay) and [SharePoint](#sharepoint) sections below for information on connecting to these services.

| variable                   | description                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `mode`                     | Specify the mode to run in. See modes below.                                                             |
| `single`                   | Load Fluid object normally when using local mode for ordering, etc.                                      |
| `fluidHost`                | Host url to target while testing. If you supply this, you must supply a tenant ID and secret             |
| `discoveryEndpoint`        | Host url to discovery endpoint while testing. If you supply this, you must supply a tenant ID and secret |
| `tenantId`                 | Tenant ID for your host. If you supply this you must supply a tenant secret                              |
| `tenantSecret`             | Secret for your tenant                                                                                   |
| `bearerSecret`             | Secret for your bearer                                                                                   |
| `enableWholeSummaryUpload` | Enables whole summary upload functionality (required for Azure Fluid Relay)                              |

| modes         | description                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `docker`      | Use docker running routerlicious server for ordering, etc. You'll need to start this service locally |
| `r11s`        | Use remote routerlicious server for ordering, etc.                                                   |
| `local`       | Load Fluid object in two side-by-side divs using test-driver (default option)                        |
| `tinylicious` | Run against a local instance of tinylicious. You'll need to start this service locally               |
| `spo-df`      | Use SharePoint DogFood server with your personal OneDrive for storage                                |
| `spo`         | Use SharePoint server with your personal OneDrive for storage                                        |

### Manually attach the container

In all modes you can start a detached container that you can later attach by appending `/manualAttach` to the url. For example - http://localhost:8080/manualAttach.

You can interact with the Fluid object and do any number of operations before clicking the `Attach Container` button to attach the container.

If in side by side mode, only one side will be visible until attached.

## Connecting to a remote server

To connect to a remote server, a host, tenant ID, tenant secret, and npm registry must be provided. These can be
provided in the following ways (looked for in the following order):

### command line:

```
npm run start -- --env discoveryEndpoint=https://discoveryendpoint.com --env tenantId=my_tenant --env tenantSecret=my_secret --env bearerSecret=bear_secret --env npm=npm.com
or
npm run start -- --env fluidHost=https://fluidhost.com --env tenantId=my_tenant --env tenantSecret=my_secret --env bearerSecret=bear_secret --env npm=npm.com
```

### environment variables:

-   `fluid__webpack__discoveryEndpoint`
-   `fluid__webpack__fluidHost`
-   `fluid__webpack__tenantId`
-   `fluid__webpack__tenantSecret`
-   `fluid__webpack__bearerSecret`
-   `fluid__webpack__npm`
-   `fluid__webpack__enableWholeSummaryUpload`

### config file:

or in an optional `config.json` file in the `baseDir` passed into `webpack-fluid-loader.after()` that looks like this:

```json
{
	"fluid": {
		"webpack": {
			"discoveryEndpoint": "https://discoveryendpoint.com",
			"fluidHost": "https://fluidhost.com",
			"tenantId": "my_tenant",
			"tenantSecret": "my_secret",
			"bearerSecret": "bear_secret",
			"npm": "npm.com",
			"enableWholeSummaryUpload": false
		}
	}
}
```

## Azure Fluid Relay

To use Azure Fluid Relay, [provision a Fluid Relay instance](https://learn.microsoft.com/azure/azure-fluid-relay/how-tos/provision-fluid-azure-portal) in the Azure Portal.
To select the deployment region, consult [the availability table](https://azure.microsoft.com/explore/global-infrastructure/products-by-region/?products=fluid-relay) for the Azure Fluid Relay product<sup id="a1">[1](#f1)</sup>.

After provisioning, the connection arguments are available in the Azure Portal under the 'Access Key' tab<sup id="a2">[2](#f2)</sup>.

When connecting to the Azure Fluid Relay service, you must specify 'enableWholeSummaryUpload=true'.

```sh
# Substitute the 'Tenant Id', 'Primary Key' and 'Service Endpoint' found under 'Access Key' in Azure Portal
npm run start:r11s --env mode=r11s \
                   --env enableWholeSummaryUpload=true \
                   --env tenantId=$TenantId \
                   --env tenantSecret=$PrimaryKey \
                   --env discoveryEndpoint=$ServiceEndpoint
```

## SharePoint

To use a SharePoint server, the following environment variables must be set:

-   local\_\_testing\_\_clientId
-   login\_\_odsp\_\_test\_\_tenants (when running against prod)
-   login\_\_odspdf\_\_test\_\_tenants (when running against dogfood)

All of these variables can be populated by running the getkeys tool.
While running examples, documents will be created/loaded using the credentials found in these environment variables.

Sometimes the cached tokens are out of date or incorrect, and it will not automatically refresh them. They can be manually refreshed by going navigating to http://localhost:8080/odspLogin (port may vary). To force reauth on start, the env variable `odspForceReauth` can be set. This can also be done by adding `--env forceReauth` to the end of the command. For example: `npm run start:spo-df -- --env forceReauth`.

Use `spo-df` if your OneDrive is on the DogFood server, and `spo` if it is not.

---

<b id="f1">1</b>: Note that The deployment region specified during provisioning only determines where the Fluid container's durable data will be stored.
For active Fluid sessions, Azure dynamically choses the lowest-latency region/cluster to host the relay service. [↩](#a1)

<b id="f2">2</b>: You may use either the 'primary key' or 'secondary key' for the tenantSecret.
Two keys are provided to enable a production system to to regenerate a key without downtime by first migrating to the alternate key.[↩](#a2)

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
