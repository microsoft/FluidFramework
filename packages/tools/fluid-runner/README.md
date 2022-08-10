# @fluidframework/fluid-runner
This package contains utility for running various functionality inside a Fluid Framework environment.

## Export File
Allows some execution to be made on a container given a provided ODSP snapshot.

### Sample command
If package is installed globally:
`node fluid-runner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFolder=outputFolderName --scenario=test --telemetryFile=telemetryFile.txt`

If working directly on this package:
`node bin/fluidRunner exportFile --codeLoader=compiledBundle.js --inputFile=inputFileName.fluid --outputFolder=outputFolderName --scenario=test --telemetryFile=telemetryFile.txt`

### Code Loader bundle format
The Code Loader bundle should provide defined exports required for this functionality.
For more details on what exports are needed, see [codeLoaderBundle.ts](./src/codeLoaderBundle.ts).

### Input file format
The input file is expected to be an ODSP snapshot.
For some examples, see the files in the [localOdspSnapshots folder](./src/test/localOdspSnapshots).
