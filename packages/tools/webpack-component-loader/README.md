# `@microsoft/fluid-webpack-component-loader`
This folder contains the webpack-component-loader. This package is meant to be used with the webpack-dev-server and is used by yo fluid as the default `start` option.

This loader is intended for development purposes only and should not be used in production.

The following environment variables can be defined when running webpack-dev-server to change the behavior of webpack-component-loader:

| variable | description |
| ---------| ----------- |
| `local` | Use a local server for ordering, etc. |
| `fluidHost` | Host url to target while testing (e.g. https://www.wu2-ppe.prague.office-int.com/). If you supply this, you must supply a tenant ID and secret |
| `tenantId` | Tenant ID for your host. If you supply this you must supply a tenant secret |
| `tenantSecret` | Secret for your tenant |
