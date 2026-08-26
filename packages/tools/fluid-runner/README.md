# @fluidframework/fluid-runner

This package contains utility for running various functionality inside a Fluid Framework environment.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:apiDocs=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/fluid-runner
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/fluid-runner`.

Import the `legacy` APIs from `@fluidframework/fluid-runner/legacy`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Export File

Allows some execution to be made on a container given a provided ODSP snapshot.

### Sample command

If package is installed globally:
`node fluid-runner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFile=result.txt --telemetryFile=telemetryFile.txt`

If working directly on this package:
`node bin/fluid-runner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFile=result.txt --telemetryFile=telemetryFile.txt`

### Code Loader bundle format

The Code Loader bundle should provide defined exports required for this functionality.
For more details on what exports are needed, see [codeLoaderBundle.ts](./src/codeLoaderBundle.ts).

#### "codeLoader" vs "IFluidFileConverter" argument

You may notice the command line argument `codeLoader` is optional. If you choose not to provide a value for `codeLoader`, you must extend this library
and provide a [`IFluidFileConverter`](./src/codeLoaderBundle.ts) implementation to the [`fluidRunner(...)`](./src/fluidRunner.ts) method.

```typescript
import { fluidRunner } from "@fluidframework/fluid-runner";

await fluidRunner({
	/* IFluidFileConverter implementation here */
});
```

> **Note**: Only one of `codeLoader` or `fluidRunner(...)` argument is allowed. If both or none are provided, an error will be thrown at the start of execution.

### Input file format

The input file is expected to be an ODSP snapshot.
For some examples, see the files in the [localOdspSnapshots folder](./src/test/localOdspSnapshots).

### Telemetry format

There is an optional command line option `telemetryFormat` that allows you to specify the telemetry output format. The naming provided to this option is strict and must match an option in [OutputFormat](./src/logger/fileLogger.ts).
The default format is currently `JSON`

### Additional telemetry properties

There is an optional command line option `telemetryProp` that allows you to specify additional properties that will be added to every telemetry entry. The format follows these rules:

-   every key must be a string
-   values may be either a string or a number
-   keys and values cannot be empty

Example of valid usages:

```
--telemetryProp prop1 value1 --telemetryProp prop2 10.5
--telemetryProp "  prop1 " "   value1 " prop2 value2
--telemetryProp prop1 "aaa=bbb" prop2 "aaa\"bbb"
```

> No trimming of white-space inside quotes

Example of invalid usages:

```
--telemetryProp "10" value1
--telemetryProp prop1
--telemetryProp=             // this will be treated as ['']
```

### Consumption

The code around `exportFile` can be consumed in multiple different layers. It is not necessary to run all this code fully as is, and the following are some interesting code bits involved in this workflow:

-   [`createLogger(...)`](./src/logger/loggerUtils.ts)
    -   Creates and wraps an `IFileLogger` and adds some useful telemetry data to every entry
-   [`createContainerAndExecute(...)`](./src/exportFile.ts)
    -   This is the core logic for running some action based on a local ODSP snapshot
-   [`getSnapshotFileContent(...)`](./src/utils.ts)
    -   Reads a local ODSP snapshot from both JSON and binary formats for usage in `createContainerAndExecute(...)`

For an example of a consumption path that differs slightly to [`exportFile(...)`](./src/exportFile.ts), see [`parseBundleAndExportFile(...)`](./src/parseBundleAndExportFile.ts). In addition to running the same logic as [`exportFile`](./src/exportFile.ts) method, it implements the logic around parsing a dynamically provided bundle path into an `IFluidFileConverter` object.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:clientRequirements=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
