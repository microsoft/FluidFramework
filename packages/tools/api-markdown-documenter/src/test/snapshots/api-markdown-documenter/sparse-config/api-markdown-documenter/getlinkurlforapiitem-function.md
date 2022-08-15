
# getLinkUrlForApiItem

Creates a link URL to the specified API item.

## Remarks

If that item is one that will be rendered to a parent document, it will contain the necessary heading identifier information to link to the appropriate heading.

## Signature

```typescript
export declare function getLinkUrlForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which we are generating the link URL. |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | See [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface) |

