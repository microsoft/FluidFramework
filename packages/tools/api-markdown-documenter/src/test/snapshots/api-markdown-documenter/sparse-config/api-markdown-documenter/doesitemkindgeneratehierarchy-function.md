
# doesItemKindGenerateHierarchy

Determines whether or not the specified API item kind is one that should generate directory-wise hierarchy in the resulting documentation suite. I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.

## Remarks

This is essentially a wrapper around [PolicyOptions.hierarchyBoundaries](docs/api-markdown-documenter/policyoptions-hierarchyboundaries-propertysignature)<!-- -->, but also enforces system-wide invariants.

Namely...

- `Package` items are \*always\* rendered to their own documents, regardless of the specified policy. - `EntryPoint` items are \*never\* rendered to their own documents (as they are completely ignored by this system), regardless of the specified policy.

## Signature

```typescript
export declare function doesItemKindGenerateHierarchy(kind: ApiItemKind, hierarchyBoundaries: HierarchyBoundaries): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  kind | ApiItemKind | The kind of API item. |
|  hierarchyBoundaries | [HierarchyBoundaries](docs/api-markdown-documenter/hierarchyboundaries-typealias) | See [HierarchyBoundaries](docs/api-markdown-documenter/hierarchyboundaries-typealias) |

