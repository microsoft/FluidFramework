
# Link

[(model)](docs/index) &gt; [@fluid-tools/api-markdown-documenter](docs/api-markdown-documenter)

Represents a link to some documentation element. A complete URL link can be created from its components (see [urlFromLink()](docs/api-markdown-documenter#urlfromlink-Function)<!-- -->).

## Signature

```typescript
export interface Link 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [headingId](docs/api-markdown-documenter/link#headingid-PropertySignature) |  | string | Optional ID of a heading in the document being linked to. |
|  [relativeFilePath](docs/api-markdown-documenter/link#relativefilepath-PropertySignature) |  | string | Path to the document being linked to. Relative to [Link.uriBase](docs/api-markdown-documenter/link#uribase-PropertySignature)<!-- -->. TODO: rename. |
|  [text](docs/api-markdown-documenter/link#text-PropertySignature) |  | string | Link text to be rendered. |
|  [uriBase](docs/api-markdown-documenter/link#uribase-PropertySignature) |  | string | URI base of the element being linked to. |

## Property Details

### headingId {#headingid-PropertySignature}

Optional ID of a heading in the document being linked to.

#### Signature

```typescript
headingId?: string;
```

### relativeFilePath {#relativefilepath-PropertySignature}

Path to the document being linked to. Relative to [Link.uriBase](docs/api-markdown-documenter/link#uribase-PropertySignature)<!-- -->. TODO: rename.

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
