
# Link

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Represents a link to some documentation element. A complete URL link can be created from its components (see [urlFromLink()](./api-markdown-documenter#urlfromlink-function)<!-- -->).

## Signature

```typescript
export interface Link 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [headingId](./api-markdown-documenter/link-interface#headingid-propertysignature) |  | string | Optional ID of a heading in the document being linked to. |
|  [relativeFilePath](./api-markdown-documenter/link-interface#relativefilepath-propertysignature) |  | string | Path to the document being linked to. Relative to [Link.uriBase](./api-markdown-documenter/link-interface#uribase-propertysignature)<!-- -->. TODO: rename. |
|  [text](./api-markdown-documenter/link-interface#text-propertysignature) |  | string | Link text to be rendered. |
|  [uriBase](./api-markdown-documenter/link-interface#uribase-propertysignature) |  | string | URI base of the element being linked to. |

## Property Details

### headingId {#headingid-propertysignature}

Optional ID of a heading in the document being linked to.

#### Signature

```typescript
headingId?: string;
```

### relativeFilePath {#relativefilepath-propertysignature}

Path to the document being linked to. Relative to [Link.uriBase](./api-markdown-documenter/link-interface#uribase-propertysignature)<!-- -->. TODO: rename.

#### Signature

```typescript
relativeFilePath: string;
```

### text {#text-propertysignature}

Link text to be rendered.

#### Signature

```typescript
text: string;
```

### uriBase {#uribase-propertysignature}

URI base of the element being linked to.

#### Signature

```typescript
uriBase: string;
```
