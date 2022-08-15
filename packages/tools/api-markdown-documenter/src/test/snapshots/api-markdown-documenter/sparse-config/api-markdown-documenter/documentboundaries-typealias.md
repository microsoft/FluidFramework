
# DocumentBoundaries

List of item kinds for which separate documents should be generated. Items specified will be rendered to their own documents. Items not specified will be rendered into their parent's contents.

## Remarks

Note that `Model` and `Package` items will \*always\* have separate documents generated for them, even if not specified.

Also note that `EntryPoint` items will always be ignored by the system, even if specified here.

## Signature

```typescript
export declare type DocumentBoundaries = ApiItemKind[];
```
