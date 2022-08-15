
# renderDocuments

Renders the provided model and its contents to a series of [MarkdownDocument](docs/api-markdown-documenter/markdowndocument-interface)<!-- -->s.

## Remarks

Which API members get their own documents and which get written to the contents of their parent is determined by [PolicyOptions.documentBoundaries](docs/api-markdown-documenter/policyoptions-documentboundaries-propertysignature)<!-- -->.

## Signature

```typescript
export declare function renderDocuments(partialConfig: MarkdownDocumenterConfiguration): MarkdownDocument[];
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  partialConfig | [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface) | A partial [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->. Missing values will be filled in with defaults defined by [markdownDocumenterConfigurationWithDefaults()](docs/api-markdown-documenter/markdowndocumenterconfigurationwithdefaults-function)<!-- -->. |

