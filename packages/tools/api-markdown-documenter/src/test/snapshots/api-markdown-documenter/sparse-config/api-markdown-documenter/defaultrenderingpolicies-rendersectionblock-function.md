
# renderSectionBlock

Default rendering format for API item sections. Wraps the item-kind-specific details in the following manner:

1. Heading (if not the document-root item) 1. Beta warning (if item annotated with `@beta`<!-- -->) 1. Deprecation notice (if any) 1. Summary (if any) 1. Remarks (if any) 1. Examples (if any) 1. Item Signature 1. `innerSectionBody`

## Signature

```typescript
export declare function renderSectionBlock(apiItem: ApiItem, innerSectionBody: DocSection | undefined, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | TODO |
|  innerSectionBody | DocSection \| undefined | TODO |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | TODO |

