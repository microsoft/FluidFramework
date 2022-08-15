
# MarkdownDocument

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Represents Markdown document contents that have not yet been written to a file.

## Signature

```typescript
export interface MarkdownDocument 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiItem](./api-markdown-documenter/markdowndocument-interface#apiitem-propertysignature) |  | ApiItem | The API item for which the document contents were generated. |
|  [contents](./api-markdown-documenter/markdowndocument-interface#contents-propertysignature) |  | DocSection | Mardown document contents. |
|  [path](./api-markdown-documenter/markdowndocument-interface#path-propertysignature) |  | string | Output path for the document to be written to. This path is relative to the base URI provided to the system. TODO: verify relative-ness |

## Property Details

### apiItem {#apiitem-propertysignature}

The API item for which the document contents were generated.

#### Signature

```typescript
apiItem: ApiItem;
```

### contents {#contents-propertysignature}

Mardown document contents.

#### Signature

```typescript
contents: DocSection;
```

### path {#path-propertysignature}

Output path for the document to be written to. This path is relative to the base URI provided to the system. TODO: verify relative-ness

#### Signature

```typescript
path: string;
```
