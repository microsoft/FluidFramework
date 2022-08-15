
# getFirstAncestorWithOwnPage

Gets the nearest ancestor of the provided item that will have its own rendered page.

## Remarks

This can be useful for determining the file path the item will ultimately be rendered under, as well as for generating links.

## Signature

```typescript
export declare function getFirstAncestorWithOwnPage(apiItem: ApiItem, documentBoundaries: DocumentBoundaries): ApiItem;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which we are generating a file path. |
|  documentBoundaries | [DocumentBoundaries](docs/api-markdown-documenter/documentboundaries-typealias) | See [DocumentBoundaries](docs/api-markdown-documenter/documentboundaries-typealias) |

