# @fluidframework/fluid-runner
This package contains utility for running various functionality inside a Fluid Framework environment.

## Export File
Allows some execution to be made on a container given a provided ODSP snapshot.

### Sample command
If package is installed globally:
`node fluid-runner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFile=result.txt --telemetryFile=telemetryFile.txt`

If working directly on this package:
```node bin/fluid-runner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFile=result.txt --telemetryFile=telemetryFile.txt```

### Code Loader bundle format
The Code Loader bundle should provide defined exports required for this functionality.
For more details on what exports are needed, see [codeLoaderBundle.ts](./src/codeLoaderBundle.ts).

#### "codeLoader" vs "IFluidFileConverter" argument
You may notice the command line argument `codeLoader` is optional. If you choose not to provide a value for `codeLoader`, you must extend this library
and provide a [`IFluidFileConverter`](./src/codeLoaderBundle.ts) implementation to the [`fluidRunner(...)`](./src/fluidRunner.ts) method.

```
import { fluidRunner } from "@fluidframework/fluid-runner";

fluidRunner({ /* IFluidFileConverter implementation here */ });
```

> **Note**: Only one of `codeLoader` or `fluidRunner(...)` argument is allowed. If both or none are provided, an error will be thrown at the start of execution.

### Input file format
The input file is expected to be an ODSP snapshot.
For some examples, see the files in the [localOdspSnapshots folder](./src/test/localOdspSnapshots).

### Consumption
The code around `exportFile` can be consumed in multiple different layers. It is not necessary to run all this code fully as is, and the following are some interesting code bits involved in this workflow:
- [`createLogger(...)`](./src/logger/FileLogger.ts)
    - Wraps a provided `FileLogger` and adds some useful telemetry data to every entry
- [`createContainerAndExecute(...)`](./src/exportFile.ts)
    - This is the core logic for running some action based on a local ODSP snapshot
- [`getSnapshotFileContent(...)`](./src/utils.ts)
    - Reads a local ODSP snapshot from both JSON and binary formats for usage in `createContainerAndExecute(...)`

For an example of a consumption path that differs slightly to [`exportFile(...)`](./src/exportFile.ts), see [`parseBundleAndExportFile(...)`](./src/parseBundleAndExportFile.ts). In addition to running the same logic as [`exportFile`](./src/exportFile.ts) method, it implements the logic around parsing a dynamically provided bundle path into an `IFluidFileConverter` object.
