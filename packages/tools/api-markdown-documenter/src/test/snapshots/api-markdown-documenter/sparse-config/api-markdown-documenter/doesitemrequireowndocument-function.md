
# doesItemRequireOwnDocument

Determines whether or not the specified API item is one that should be rendered to its own document.

## Remarks

This is based on the item's `kind`<!-- -->. See [doesItemKindRequireOwnDocument()](docs/api-markdown-documenter/doesitemkindrequireowndocument-function)<!-- -->.

## Signature

```typescript
export declare function doesItemRequireOwnDocument(apiItem: ApiItem, documentBoundaries: DocumentBoundaries): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  documentBoundaries | [DocumentBoundaries](docs/api-markdown-documenter/documentboundaries-typealias) |  |

