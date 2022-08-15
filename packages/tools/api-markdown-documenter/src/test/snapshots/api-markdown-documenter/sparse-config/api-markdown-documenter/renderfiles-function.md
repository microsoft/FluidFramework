
# renderFiles

Renders the provided model and its contents, and writes each document to a file on disk.

## Remarks

Which API members get their own documents and which get written to the contents of their parent is determined by [PolicyOptions.documentBoundaries](docs/api-markdown-documenter/policyoptions-documentboundaries-propertysignature)<!-- -->.

The file paths under which the files will be saved is determined by the provided output path and the following configuration properties:

- [PolicyOptions.documentBoundaries](docs/api-markdown-documenter/policyoptions-documentboundaries-propertysignature) - [PolicyOptions.hierarchyBoundaries](docs/api-markdown-documenter/policyoptions-hierarchyboundaries-propertysignature) - [PolicyOptions.fileNamePolicy](docs/api-markdown-documenter/policyoptions-filenamepolicy-propertysignature)

## Signature

```typescript
export declare function renderFiles(partialConfig: MarkdownDocumenterConfiguration, outputDirectoryPath: string, maybeMarkdownEmitter?: MarkdownEmitter): Promise<void>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  partialConfig | [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface) | A partial [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->. Missing values will be filled in with defaults defined by [markdownDocumenterConfigurationWithDefaults()](docs/api-markdown-documenter/markdowndocumenterconfigurationwithdefaults-function)<!-- -->. |
|  outputDirectoryPath | string |  |
|  maybeMarkdownEmitter | [MarkdownEmitter](docs/api-markdown-documenter/markdownemitter-class) | The emitter to use for generating Markdown output. If not provided, a [default implementation](docs/api-markdown-documenter/markdownemitter-class) will be used. |

