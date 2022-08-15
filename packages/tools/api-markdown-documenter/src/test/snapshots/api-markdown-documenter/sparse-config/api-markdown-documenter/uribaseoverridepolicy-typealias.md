
# UriBaseOverridePolicy

Policy for overriding the URI base for a specific API item.

## Remarks

This can be used to match on particular item kinds, package names, etc., and adjust the links generated in the documentation accordingly.

## Signature

```typescript
export declare type UriBaseOverridePolicy = (apiItem: ApiItem) => string | undefined;
```
