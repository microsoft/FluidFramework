# Tinylicious

Tinylicious is a minimal, self-contained, test implementation of the Fluid Framework service that is much smaller (tinier!) than Routerlicious, our reference implementation of the service.

## What is this for?
Tinylicious includes most of the basic features needed to **test** components and containers. While we use the [Webpack Component Loader](../../packages/tools/webpack-component-loader)'s in browser service for our much of our component and container development, Tinylicious offers some advantages because it's a standalone process. For instance, testing a Fluid Container from 2+ simultaneously connected clients can be easier using Tinylicious.

If you're looking for a reference implementation of the Fluid service, don't look here! Go check out [Routerlicious](../routerlicious).

## Getting Started
You can install, build, and start this service by running the following

```sh
npm i
npm run build
npm run start
```
