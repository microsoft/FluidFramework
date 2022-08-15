
# getFilteredParent

Gets the "filted" parent of the provided API item. This logic specifically skips items of the following kinds:

- EntryPoint - Skipped because any given Package item will have exactly 1 EntryPoint child, making this redundant in the hierarchy.

## Signature

```typescript
export declare function getFilteredParent(apiItem: ApiItem): ApiItem | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

