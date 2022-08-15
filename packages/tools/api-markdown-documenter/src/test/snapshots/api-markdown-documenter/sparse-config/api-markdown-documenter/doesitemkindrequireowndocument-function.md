
# doesItemKindRequireOwnDocument

Determines whether or not the specified API item kind is one that should be rendered to its own document.

## Remarks

This is essentially a wrapper around [PolicyOptions.documentBoundaries](docs/api-markdown-documenter/policyoptions-documentboundaries-propertysignature)<!-- -->, but also enforces system-wide invariants.

Namely...

- `Model` and `Package` items are \*always\* rendered to their own documents, regardless of the specified policy. - `EntryPoint` items are \*never\* rendered to their own documents (as they are completely ignored by this system), regardless of the specified policy.

## Signature

```typescript
export declare function doesItemKindRequireOwnDocument(kind: ApiItemKind, documentBoundaries: DocumentBoundaries): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  kind | ApiItemKind | The kind of API item. |
|  documentBoundaries | [DocumentBoundaries](docs/api-markdown-documenter/documentboundaries-typealias) | See [DocumentBoundaries](docs/api-markdown-documenter/documentboundaries-typealias) |

