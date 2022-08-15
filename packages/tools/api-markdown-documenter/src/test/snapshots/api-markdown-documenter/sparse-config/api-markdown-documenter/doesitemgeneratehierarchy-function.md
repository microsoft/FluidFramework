
# doesItemGenerateHierarchy

Determines whether or not the specified API item is one that should generate directory-wise hierarchy in the resulting documentation suite. I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.

## Remarks

This is based on the item's `kind`<!-- -->. See [doesItemKindGenerateHierarchy()](docs/api-markdown-documenter/doesitemkindgeneratehierarchy-function)<!-- -->.

## Signature

```typescript
export declare function doesItemGenerateHierarchy(apiItem: ApiItem, hierarchyBoundaries: HierarchyBoundaries): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  hierarchyBoundaries | [HierarchyBoundaries](docs/api-markdown-documenter/hierarchyboundaries-typealias) |  |

