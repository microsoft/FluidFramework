In support of customer contract for [API support levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels), exported APIs are [TSDoc tagged with support level](../Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md), [package.json "exports"](https://nodejs.org/api/packages.html#exports) are set, and [build tooling](../../../build-tools/packages/build-cli/README.md) verifies API consistency with [api-extractor](https://api-extractor.com/) and makes sure the APIs are available thru appropriate import paths ([`flub generate entrypoints`](../../../build-tools/packages/build-cli/docs/generate.md#flub-generate-entrypoints)).

# Configuration

Packages using standard build tooling require two manual configurations:

1. package.json "exports" with entries for each supported API level.

    Only levels with a matching export should be created. Once in place, stage a deprecation sequence before removing levels no longer supported.

    For customer API import paths (those not starting with "./internal"), "types" paths should reference a suitably named .d.ts file next to output of tsc generated files. For example, "./beta" entry's "import"-"types" path is typically "./lib/beta.d.ts". The corresponding "default" path for JavaScript will use the main entrypoint file, typically "./lib/index.js". (Build tooling only generates filtered .d.ts files and all runtime use may just use the main entrypoint that provides everything.)

    A typical beta entry supporting both ESM and CommonJS:

    ```json
     	"./beta": {
     		"import": {
     			"types": "./lib/beta.d.ts",
     			"default": "./lib/index.js"
     		},
     		"require": {
     			"types": "./dist/beta.d.ts",
     			"default": "./dist/index.js"
     		}
     	},
    ```

2. For packages with "./legacy" APIs, "api-extractor/api-extractor.current.json"'s "mainEntryPointFilePath" value should be set to the least stable .d.ts types path in use. E.g. this preference order: `"<projectFolder>/lib/alpha.d.ts"`, `"<projectFolder>/lib/beta.d.ts"`, and finally `"<projectFolder>/lib/public.d.ts"`. Eventually, this configuration could be automated via policy checker. (Packages without "./legacy" will reference `"<projectFolder>/lib/index.d.ts"` in "api-extractor.json".)

# Automation

Configuring `api-extactor` grows linearly with number of API levels supported. [`flub check policy --fix`](../../../build-tools/packages/build-cli/docs/check.md#flub-check-policy) may be used to make sure there is proper linting (including generation of new files and package.json script entries).
The policy only ensures that entrypoints are checked but does not enforce any settings within the api-extractor configuration files.

## Limitations

Check policy does not handle:

1. `"api-extractor:*"` (generates entrypoints; to be renamed), `"build:api-reports"`, `"ci:build:api-reports"`, `"check:are-the-types-wrong"` setup. Follow pattern seen in other packages and note [Configuration](#configuration) #2.

1. Removal of checks and configuration files for no longer used API levels must be done manually.

# Example

PR [#22208: build(client): add @beta support to core-interfaces](https://github.com/microsoft/FluidFramework/pull/22208/files) shows how "./beta" support is added to `@fluidframework/core-interfaces` that has legacy support.
"./beta" was added to "package.json" and "mainEntryPointFilePath" was updated in "api-extractor/api-extractor.current.json" manually.
Other API support changes made to "README.md", "package.json", and "api-extractor/api-extractor-lint-beta*" files were made by policy check and `build:readme` (both part of full build).
