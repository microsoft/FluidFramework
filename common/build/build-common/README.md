# @fluidframework/build-common

This package contains common build configurations that are applicable to all the packages in the Fluid Framework repo.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on Fluid Framework and packages within.

## API-Extractor Configuration

This package exports a base configuration for use with [API-Extractor](https://api-extractor.com/).
It can be extended in your package's local configuration file like the following:

```json
"extends": "@fluidframework/build-common/api-extractor-base.json",
```

### Legacy Configurations

This package previously exported a series of configurations with differing levels of validation.
These configurations are now deprecated and have been replaced with the configuration noted above.
