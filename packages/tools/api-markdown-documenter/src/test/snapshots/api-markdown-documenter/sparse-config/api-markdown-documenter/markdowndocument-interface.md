
# MarkdownDocument

Represents Markdown document contents that have not yet been written to a file.

## Signature

```typescript
export interface MarkdownDocument 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiItem](docs/api-markdown-documenter/markdowndocument-apiitem-propertysignature) |  | ApiItem | The API item for which the document contents were generated. |
|  [contents](docs/api-markdown-documenter/markdowndocument-contents-propertysignature) |  | DocSection | Mardown document contents. |
|  [path](docs/api-markdown-documenter/markdowndocument-path-propertysignature) |  | string | Output path for the document to be written to. This path is relative to the base URI provided to the system. TODO: verify relative-ness |

