# `@microsoft/fluid-webpack-component-loader`
This folder contains the webpack-component-loader. This package is meant to be used with the webpack-dev-server and is used by yo fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running webpack-dev-server to change the behavior of webpack-component-loader:

| variable | description |
| ---------| ----------- |
| `mode` | Specify the mode to run in. See modes below. |
| `single` | Load component normally when using local mode for ordering, etc. |
| `fluidHost` | Host url to target while testing. If you supply this, you must supply a tenant ID and secret |
| `tenantId` | Tenant ID for your host. If you supply this you must supply a tenant secret |
| `tenantSecret` | Secret for your tenant |
| `bearerSecret` | Secret for your bearer |


| modes | description |
| ---------| ----------- |
| `docker` | Use docker running routerlicious server for ordering, etc. |
| `r11s`   | Use remote routerlicious server for ordering, etc. |
| `local`  | Load component in two side-by-side divs using test-driver (default option) |
| `tinylicous` | Run against a local instance of tinylicious |
| `spo-df` | Use SharePoint DogFood server with your personal OneDrive for storage |
| `spo` | Use SharePoint server with your personal OneDrive for storage |

### Detached Container
In all modes you can start with a detached container by appending #manualAttach to the url.

If in side by side mode, only one side will be visable until attached.

Clicking the attach buttom will attach the container, and remove #manualAttach from the url.

To use the detach flow for spo-df, you need to provide driveId also. eg. --env.driveId value

## Connecting to a remote server

To connect to a remote server, a host, tenant ID, tenant secret, and npm registry must be provided. These can be
provided in the following ways (looked for in the following order):

### command line:
```
npm run start -- --env.fluidHost https://fluidhost.com --env.tenantId my_tenant --env.tenantSecret my_secret --env.bearerSecret bear_secret --env.npm npm.com
```

### environment variables:
- `fluid__webpack__fluidHost`
- `fluid__webpack__tenantId`
- `fluid__webpack__tenantSecret`
- `fluid__webpack__bearerSecret`
- `fluid__webpack__npm`

### config file:
or in an optional `config.json` file in the `baseDir` passed into `webpack-component-loader.after()` that looks like this:
``` json
{
    "fluid": {
        "webpack": {
            "fluidHost": "https://fluidhost.com",
            "tenantId": "my_tenant",
            "tenantSecret": "my_secret",
            "bearerSecret": "bear_secret",
            "npm": "npm.com"
        }
    }
}

```

## SharePoint
To use a SharePoint server, the Microsoft login clientId and secret environment variables must be set.  This can be done by running the getkeys tool.

Sometimes the cached tokens are out of date or incorrect, and it will not automatically refresh them.  They can be manually refreshed by going navigating to http://localhost:8080/odspLogin (port may vary).  To force reauth on start, the env variable `odspForceReauth` can be set.  This can also be done by adding `--env.mode forceReauth true` to the end of the command.  For example: `npm run start:spo-df -- --env.mode forceReauth true`.

Use `spo-df` if your OneDrive is on the DogFood server, and `spo` if it is not.
