
# filterByKind

Filters the provided list of API items based on the provided `kinds`<!-- -->.

## Signature

```typescript
export declare function filterByKind(apiItems: readonly ApiItem[], kinds: ApiItemKind[]): ApiItem[];
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItems | readonly ApiItem\[\] | The list of items being filtered. |
|  kinds | ApiItemKind\[\] | The kinds of items to consider. An item is considered a match if it matches any kind in this list. |

