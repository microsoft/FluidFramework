
# MarkdownDocumenterConfiguration

Configuration options for the Markdown documenter.

## Signature

```typescript
export interface MarkdownDocumenterConfiguration extends PolicyOptions, RenderingPolicies 
```
<b>Extends:</b> [PolicyOptions](docs/api-markdown-documenter/policyoptions-interface)

, [RenderingPolicies](docs/api-markdown-documenter/renderingpolicies-interface)


## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiModel](docs/api-markdown-documenter/markdowndocumenterconfiguration-apimodel-propertysignature) |  | ApiModel | API Model for which the documentation is being generated. This is the output of [API-Extractor](https://api-extractor.com/)<!-- -->. |
|  [newlineKind](docs/api-markdown-documenter/markdowndocumenterconfiguration-newlinekind-propertysignature) |  | NewlineKind | Specifies what type of newlines API Documenter should use when writing output files. By default, the output files will be written with Windows-style newlines. |
|  [tsdocConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-tsdocconfiguration-propertysignature) |  | TSDocConfiguration | TSDoc Configuration to use when parsing source-code documentation. If not provided, a default configuration will be used. |
|  [uriRoot](docs/api-markdown-documenter/markdowndocumenterconfiguration-uriroot-propertysignature) |  | string | Default root uri used when generating content links. |
|  [verbose](docs/api-markdown-documenter/markdowndocumenterconfiguration-verbose-propertysignature) |  | boolean | Whether or not verbose logging is enabled. |

