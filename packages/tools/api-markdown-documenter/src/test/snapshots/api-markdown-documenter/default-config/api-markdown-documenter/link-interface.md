
# Link

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Represents a link to some documentation element. A complete URL link can be created from its components (see [urlFromLink()](./api-markdown-documenter#urlfromlink-Function)<!-- -->).

## Signature

```typescript
export interface Link 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [headingId](./api-markdown-documenter/link-interface#headingid-PropertySignature) |  | string | Optional ID of a heading in the document being linked to. |
|  [relativeFilePath](./api-markdown-documenter/link-interface#relativefilepath-PropertySignature) |  | string | Path to the document being linked to. Relative to [Link.uriBase](./api-markdown-documenter/link-interface#uribase-PropertySignature)<!-- -->. TODO: rename. |
|  [text](./api-markdown-documenter/link-interface#text-PropertySignature) |  | string | Link text to be rendered. |
|  [uriBase](./api-markdown-documenter/link-interface#uribase-PropertySignature) |  | string | URI base of the element being linked to. |

## Property Details

### headingId {#headingid-PropertySignature}

Optional ID of a heading in the document being linked to.

#### Signature

```typescript
headingId?: string;
```

### relativeFilePath {#relativefilepath-PropertySignature}

Path to the document being linked to. Relative to [Link.uriBase](./api-markdown-documenter/link-interface#uribase-PropertySignature)<!-- -->. TODO: rename.

#### Signature

```typescript
relativeFilePath: string;
```

### text {#text-PropertySignature}

Link text to be rendered.

#### Signature

```typescript
text: string;
```

### uriBase {#uribase-PropertySignature}

URI base of the element being linked to.

#### Signature

```typescript
uriBase: string;
```
