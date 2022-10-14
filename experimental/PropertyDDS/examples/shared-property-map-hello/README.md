# Shared Property Map - Hello World

React based demonstrator for [shared-property-map](https://github.com/dstanesc/shared-property-map) testing tool

## Azure env setup
```
export FLUID_MODE=frs
export SECRET_FLUID_RELAY=https://us.fluidrelay.azure.com
export SECRET_FLUID_TOKEN=xyz
export SECRET_FLUID_TENANT=xyz
```

## Local env setup

```
export FLUID_MODE=tiny
```

## Start

```
npx tinylicious
```

```
npm run clean
npm install --legacy-peer-deps
npm run build
npm start
```