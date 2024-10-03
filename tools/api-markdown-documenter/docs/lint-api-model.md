`api-markdown-documenter lint-api-model`
========================================

Runs a validation pass over the specified API model, reporting any errors found.
This includes broken `{@link}` and `{@inheritDoc}` tag references, which can not be evaluated on a package-by-package basis by API-Extractor.

* [`api-markdown-documenter lint-api-model APIMODELDIRECTORY`](#api-markdown-documenter-lint-api-model-apimodeldirectory)

## `api-markdown-documenter lint-api-model APIMODELDIRECTORY`

Runs a validation pass over the specified API model, reporting any errors found.

```
USAGE
  $ api-markdown-documenter lint-api-model APIMODELDIRECTORY [-q | -v] [-w <value>]

ARGUMENTS
  APIMODELDIRECTORY  Path to the directory containing the series of `.api.json` files that comprise the API Model.

FLAGS
  -q, --quiet                     Whether or not to silence logging.
  -v, --verbose                   Whether or not to perform verbose logging.
  -w, --workingDirectory=<value>  [default: /workspaces/FluidFramework/tools/api-markdown-documenter] The working
                                  directory to run the command in.

DESCRIPTION
  Runs a validation pass over the specified API model, reporting any errors found.
  This includes broken `{@link}` and `{@inheritDoc}` tag references, which can not be evaluated on a package-by-package
  basis by API-Extractor.

EXAMPLES
  $ api-markdown-documenter lint-api-model
```

_See code: [src/commands/lint-api-model.ts](https://github.com/microsoft/FluidFramework/blob/v0.0.0/src/commands/lint-api-model.ts)_
