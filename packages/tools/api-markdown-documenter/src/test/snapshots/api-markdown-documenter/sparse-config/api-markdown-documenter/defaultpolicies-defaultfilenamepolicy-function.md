
# defaultFileNamePolicy

Default [PolicyOptions.fileNamePolicy](docs/api-markdown-documenter/policyoptions-filenamepolicy-propertysignature)<!-- -->.

Uses a cleaned-up version of the item's `displayName`<!-- -->, except for the following types:

- Model: Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root. - Package: uses only the unscoped portion of the package name is used.

## Signature

```typescript
function defaultFileNamePolicy(apiItem: ApiItem): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

