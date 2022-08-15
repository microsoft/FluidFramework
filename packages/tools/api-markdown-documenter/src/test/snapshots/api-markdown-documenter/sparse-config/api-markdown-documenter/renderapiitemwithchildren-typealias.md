
# RenderApiItemWithChildren

TODO

## Signature

```typescript
export declare type RenderApiItemWithChildren<TApiItem extends ApiItem> = (apiItem: TApiItem, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection) => DocSection;
```
