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

Import the `public` APIs from `@fluidframework/fluid-runner`.

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
`IFluidFileConverter` retains its string output contract. Trusted converters can instead implement the internal
`IFluidFileConverterWithBinaryOutput` or `IFluidFileConverterWithDirectoryOutput` contracts. `exportFile(...)` writes returned
`Uint8Array` bytes directly without text encoding. Directory output is materialized beneath the requested output path.

```typescript
import {
	fluidRunner,
	type IFluidFileConverterWithBinaryOutput,
} from "@fluidframework/fluid-runner/internal";

const converter: IFluidFileConverterWithBinaryOutput = {
	getCodeLoader: async () => codeLoader,
	execute: async () => Uint8Array.from([0x00, 0xff]),
};

await fluidRunner(converter);
```

Directory converters return plain data with forward-slash-separated relative paths:

```typescript
import {
	fluidRunner,
	type IFluidFileConverterWithDirectoryOutput,
} from "@fluidframework/fluid-runner/internal";

const converter: IFluidFileConverterWithDirectoryOutput = {
	getCodeLoader: async () => codeLoader,
	execute: async () => ({
		directories: ["empty"],
		files: [
			{ path: "content/readme.txt", content: "Exported from Fluid" },
			{ path: "content/data.bin", content: Uint8Array.from([0x00, 0xff]) },
		],
	}),
};

await fluidRunner(converter);
```

The output path must not already exist. Directory paths must be portable, non-empty, forward-slash-separated relative
paths without `.` or `..` segments; duplicate and conflicting paths are rejected. All paths are validated before the
output root is created, files are created exclusively, and a partially materialized root is removed if writing fails.
Directory output materializes the returned folder and file structure at the requested output path.

> **Note**: Only one of `codeLoader` or `fluidRunner(...)` argument is allowed. If both or none are provided, an error will be thrown at the start of execution.

### Input file format

The input file is the unmodified response body of an ODSP whole-file request. It is not the Code Loader bundle.
Both JSON snapshots and compact `application/ms-fluid` snapshots are supported.
For some examples, see the files in the [localOdspSnapshots folder](./src/test/localOdspSnapshots).

#### Producing an input file from ODSP

Trusted ODSP integrations can download the whole-file payload from:

```text
https://{host}/_api/v2.1/drives/{driveId}/items/{itemId}/opStream/content?attachments=1
```

This read uses ODSP's auth-in-body request format: send an HTTP `POST` with these headers:

```text
Accept: application/json, application/ms-fluid; v=1.0
Content-Type: multipart/form-data;boundary={boundary}
```

Construct the body using CRLF line endings and a blank line before the closing boundary:

```text
--{boundary}
Authorization: {authorization-header}
X-HTTP-Method-Override: GET
prefer: manualredirect
_post: 1

--{boundary}--
```

Include other lines required by the resolved ODSP URL, such as `X-CLP-Compliant-App` or share-link redemption
information. This is the same request convention used by the ODSP driver's
[snapshot fetcher](../../drivers/odsp-driver/src/fetchSnapshot.ts). Obtain the authorization header from the
host's ODSP storage-token provider; do not place bearer tokens in source, command lines, telemetry, or logs.

After checking the HTTP response status, write `response.arrayBuffer()` to `--inputFile` unchanged. Do not decode
and re-encode a compact response as text.

Keep `attachments=1` in the URL so the downloaded input also contains attachment bytes needed during conversion.

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
    -   This internal helper preserves the converter's output type: text converters return `Promise<string>`, binary converters return `Promise<Uint8Array>`, and directory converters return `Promise<IFluidFileConverterDirectoryOutput>`
-   [`getSnapshotFileContent(...)`](./src/utils.ts)
    -   Reads a local ODSP snapshot from both JSON and binary formats for usage in `createContainerAndExecute(...)`

For an example of a consumption path that differs slightly to [`exportFile(...)`](./src/exportFile.ts), see [`parseBundleAndExportFile(...)`](./src/parseBundleAndExportFile.ts). In addition to running the same logic as [`exportFile`](./src/exportFile.ts) method, it implements the logic around parsing a dynamically provided bundle path into a `FluidFileConverter` object.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:clientRequirements=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
