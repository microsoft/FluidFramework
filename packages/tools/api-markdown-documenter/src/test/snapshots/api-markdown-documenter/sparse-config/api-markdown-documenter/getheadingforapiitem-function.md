
# getHeadingForApiItem

Generates a [Heading](docs/api-markdown-documenter/heading-interface) for the specified API item.

## Signature

```typescript
export declare function getHeadingForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>, headingLevel?: number): Heading;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which the heading is being generated. |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | See [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->. |
|  headingLevel | number | Heading level to use. If not specified, the heading level will be automatically generated based on the item's context in the resulting document. |

