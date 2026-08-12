---
"@fluidframework/fluid-runner": minor
"__section": feature
---
Add support for binary file and directory converter outputs

Trusted Fluid file converters can now return a `Uint8Array` for a binary file or an
`IFluidFileConverterDirectoryOutput` for a directory tree. File bytes are preserved, and directory output is
materialized safely at a new output path. Use the internal `IFluidFileConverterWithBinaryOutput` or
`IFluidFileConverterWithDirectoryOutput` contract when supplying a converter to `fluidRunner`.
Fluid runner leaves archive creation to consumers that need a ZIP or another packaged format.

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
