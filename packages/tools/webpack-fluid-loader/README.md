# @fluid-tools/webpack-fluid-loader

This folder contains the webpack-fluid-loader. This package is meant to be used with the `webpack --serve` and is used by yo Fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running `webpack --serve` to change the behavior of webpack-fluid-loader:

| variable | description |
| ---------| ----------- |
| `mode` | Specify the mode to run in. See modes below. |
| `single` | Load Fluid object normally when using local mode for ordering, etc. |
| `fluidHost` | Host url to target while testing. If you supply this, you must supply a tenant ID and secret |
| `discoveryEndpoint` | Host url to discovery endpoint while testing. If you supply this, you must supply a tenant ID and secret |
| `tenantId` | Tenant ID for your host. If you supply this you must supply a tenant secret |
| `tenantSecret` | Secret for your tenant |
| `bearerSecret` | Secret for your bearer |
| `enableWholeSummaryUpload` | Enables whole summary upload functionality when using routerlicious or docker mode |


| modes | description |
| ---------| ----------- |
| `docker` | Use docker running routerlicious server for ordering, etc. You'll need to start this service locally |
| `r11s`   | Use remote routerlicious server for ordering, etc. |
| `local`  | Load Fluid object in two side-by-side divs using test-driver (default option) |
| `tinylicious` | Run against a local instance of tinylicious. You'll need to start this service locally |
| `spo-df` | Use SharePoint DogFood server with your personal OneDrive for storage |
| `spo` | Use SharePoint server with your personal OneDrive for storage |

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
- `fluid__webpack__discoveryEndpoint`
- `fluid__webpack__fluidHost`
- `fluid__webpack__tenantId`
- `fluid__webpack__tenantSecret`
- `fluid__webpack__bearerSecret`
- `fluid__webpack__npm`
- `fluid__webpack__enableWholeSummaryUpload`

### config file:
or in an optional `config.json` file in the `baseDir` passed into `webpack-fluid-loader.after()` that looks like this:
``` json
{
    "fluid": {
        "webpack": {
            "discoveryEndpoint": "https://discoveryendpoint.com",
            "fluidHost": "https://fluidhost.com",
            "tenantId": "my_tenant",
            "tenantSecret": "my_secret",
            "bearerSecret": "bear_secret",
            "npm": "npm.com",
            "enableWholeSummaryUpload": false,
        }
    }
}

```

## SharePoint
To use a SharePoint server, the Microsoft login clientId and secret environment variables must be set.  This can be done by running the getkeys tool.

Sometimes the cached tokens are out of date or incorrect, and it will not automatically refresh them.  They can be manually refreshed by going navigating to http://localhost:8080/odspLogin (port may vary).  To force reauth on start, the env variable `odspForceReauth` can be set.  This can also be done by adding `--env forceReauth` to the end of the command.  For example: `npm run start:spo-df -- --env forceReauth`.

Use `spo-df` if your OneDrive is on the DogFood server, and `spo` if it is not.
