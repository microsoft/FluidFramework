---
"@fluidframework/fluid-runner": minor
"__section": feature
---
Add support for binary converter output

Trusted Fluid file converters can now return a `Uint8Array`, enabling exports such as ZIP-based `.work` files without converting their bytes to text.
Use the internal `IFluidFileConverterWithBinaryOutput` contract when supplying a converter to `fluidRunner`.

```typescript
import {
	fluidRunner,
	type IFluidFileConverterWithBinaryOutput,
} from "@fluidframework/fluid-runner/internal";

const converter: IFluidFileConverterWithBinaryOutput = {
	getCodeLoader: async () => codeLoader,
	execute: async () => zipBytes,
};

await fluidRunner(converter);
```
