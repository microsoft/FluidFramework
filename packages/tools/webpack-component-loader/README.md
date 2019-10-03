# `@microsoft/fluid-webpack-component-loader`
This folder contains the webpack-component-loader. This package is meant to be used with the webpack-dev-server and is used by yo fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running webpack-dev-server to change the behavior of webpack-component-loader:

| variable | description |
| ---------| ----------- |
| `local` | Load component in two side-by-side divs using local-test-server |
| `single` | Load component normally using local-test-server server for ordering, etc. |
| `localhost` | Use local routerlicious server for ordering, etc. |
| `live` | Use remote routerlicious server for ordering, etc. (default option) |
| `fluidHost` | Host url to target while testing. If you supply this, you must supply a tenant ID and secret |
| `tenantId` | Tenant ID for your host. If you supply this you must supply a tenant secret |
| `tenantSecret` | Secret for your tenant |
| `component` | Load your component inside of a container |

To connect to a remote server, a host, tenant ID, tenant secret, and npm registry must be provided. These can be at the command line:
```
npm run start -- --env.fluidHost http://fluidhost.com --env.tenantId my_tenant --env.tenantSecret my_secret --env.npm npm.com
```

in the environment variables `fluid__webpack__tenantId` and `fluid__webpack__tenantSecret`, or in an optional `config.json` file in the `baseDir` passed into `webpack-component-loader.after()` that looks like this:

``` json
{
    "fluid": {
        "webpack": {
            "fluidHost": "http://fluidhost.com",
            "tenantId": "my_tenant",
            "tenantSecret": "my_secret",
            "npm": "npm.com"
        }
    }
}

```