# `@microsoft/fluid-webpack-component-loader`
This folder contains the webpack-component-loader. This package is meant to be used with the webpack-dev-server and is used by yo fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running webpack-dev-server to change the behavior of webpack-component-loader:

| variable | description |
| ---------| ----------- |
| `local` | Load component in two side-by-side divs using local-test-server |
| `single` | Load component normally using local-test-server server for ordering, etc. |
| `docker` | Use docker running routerlicious server for ordering, etc. |
| `live` | Use remote routerlicious server for ordering, etc. (default option) |
| `fluidHost` | Host url to target while testing. If you supply this, you must supply a tenant ID and secret |
| `tenantId` | Tenant ID for your host. If you supply this you must supply a tenant secret |
| `tenantSecret` | Secret for your tenant |
| `bearerSecret` | Secret for your bearer |
| `component` | Load your component inside of a container |

To connect to a remote server, a host, tenant ID, tenant secret, and npm registry must be provided. These can be at the command line:
```
npm run start -- --env.fluidHost https://fluidhost.com --env.tenantId my_tenant --env.tenantSecret my_secret --env.bearerSecret bear_secret --env.npm npm.com
```

in environment variables:
- `fluid__webpack__fluidHost`
- `fluid__webpack__tenantId`
- `fluid__webpack__tenantSecret`
- `fluid__webpack__bearerSecret`
- `fluid__webpack__npm`

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