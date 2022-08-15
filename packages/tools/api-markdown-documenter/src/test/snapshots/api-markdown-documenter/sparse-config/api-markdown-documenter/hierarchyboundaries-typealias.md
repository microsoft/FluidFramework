
# HierarchyBoundaries

List of item kinds for which sub-directories will be generated, and under which child item pages will be created. If not specified for an item kind, any children of items of that kind will be generated adjacent to the parent.

For items specified, the name of the sub-directory will be defined by the [FileNamePolicy](docs/api-markdown-documenter/filenamepolicy-typealias)<!-- -->.

## Signature

```typescript
export declare type HierarchyBoundaries = ApiItemKind[];
```
