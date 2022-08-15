
# getHeadingIdForApiItem

Generates a unique heading ID for the provided API item.

## Remarks

Notes:

- If the item is one that will be rendered to its own document, this will return `undefined`<!-- -->. Any links pointing to this item may simply link to the document; no heading ID is needed. - The resulting ID is context-dependent. In order to guarantee uniqueness, it will need to express hierarchical information up to the ancester item whose document the specified item will ultimately be rendered to.

## Signature

```typescript
export declare function getHeadingIdForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): string | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which the heading ID is being generated. |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | See [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->. |

