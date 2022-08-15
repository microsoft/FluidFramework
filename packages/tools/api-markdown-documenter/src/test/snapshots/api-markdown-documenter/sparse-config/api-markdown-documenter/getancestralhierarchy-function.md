
# getAncestralHierarchy

Gets the ancestral hierarchy of the provided API item by walking up the parentage graph and emitting any items matching the `includePredecate` until it reaches an item that matches the `breakPredecate`<!-- -->.

## Remarks

Notes:

- This will not include the provided item itself, even if it matches the `includePredecate`<!-- -->.

- This will not include the item matching the `breakPredecate`<!-- -->, even if they match the `includePredecate`<!-- -->.

## Signature

```typescript
export declare function getAncestralHierarchy(apiItem: ApiItem, includePredecate: (apiItem: ApiItem) => boolean, breakPredicate?: (apiItem: ApiItem) => boolean): ApiItem[];
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item whose ancestral hierarchy is being queried. |
|  includePredecate | (apiItem: ApiItem) =&gt; boolean | Predicate to determine which items in the hierarchy should be preserved in the returned list. The provided API item will not be included in the output, even if it would be included by this. |
|  breakPredicate | (apiItem: ApiItem) =&gt; boolean | Predicate to determine when to break from the traversal and return. The item matching this predicate will not be included, even if it would be included by <code>includePredicate</code>. |

