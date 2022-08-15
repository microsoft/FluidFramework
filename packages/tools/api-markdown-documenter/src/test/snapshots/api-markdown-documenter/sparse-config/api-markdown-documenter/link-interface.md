
# Link

Represents a link to some documentation element. A complete URL link can be created from its components (see [urlFromLink()](docs/api-markdown-documenter/urlfromlink-function)<!-- -->).

## Signature

```typescript
export interface Link 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [headingId](docs/api-markdown-documenter/link-headingid-propertysignature) |  | string | Optional ID of a heading in the document being linked to. |
|  [relativeFilePath](docs/api-markdown-documenter/link-relativefilepath-propertysignature) |  | string | Path to the document being linked to. Relative to [Link.uriBase](docs/api-markdown-documenter/link-uribase-propertysignature)<!-- -->. TODO: rename. |
|  [text](docs/api-markdown-documenter/link-text-propertysignature) |  | string | Link text to be rendered. |
|  [uriBase](docs/api-markdown-documenter/link-uribase-propertysignature) |  | string | URI base of the element being linked to. |

