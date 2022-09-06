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

#### "codeLoaderBundle" vs "IFluidFileConverter" argument
You may notice the command line argument `codeLoaderBundle` is optional. If you choose not to provide an implementation here, you must extend this library
and provide a [`IFluidFileConverter`](./src/codeLoaderBundle.ts) implementation to the [`fluidRunner`](./src/fluidRunner.ts) method.

```
import { fluidRunner } from "@fluidframework/fluid-runner";

fluidRunner({ /* IFluidFileConverter implementation here */ });
```

In the case that both the `fluidRunner` method argument and `codeLoaderBundle` command line argument are provided, the value for `codeLoaderBundle` will take precedence.

### Input file format
The input file is expected to be an ODSP snapshot.
For some examples, see the files in the [localOdspSnapshots folder](./src/test/localOdspSnapshots).
