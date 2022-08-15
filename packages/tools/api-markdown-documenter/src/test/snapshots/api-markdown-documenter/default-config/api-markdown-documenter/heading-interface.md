
# Heading

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Represents a document heading.

## Signature

```typescript
export interface Heading 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [id](./api-markdown-documenter/heading-interface#id-PropertySignature) |  | string | Heading ID. If not specified, no explicit ID will be associated with the heading. |
|  [level](./api-markdown-documenter/heading-interface#level-PropertySignature) |  | number | Level of the heading. If not specified, it will be automatically generated based on context. |
|  [title](./api-markdown-documenter/heading-interface#title-PropertySignature) |  | string | Heading text content. |

## Property Details

### id {#id-PropertySignature}

Heading ID. If not specified, no explicit ID will be associated with the heading.

#### Signature

```typescript
id?: string;
```

### level {#level-PropertySignature}

Level of the heading. If not specified, it will be automatically generated based on context.

#### Signature

```typescript
level?: number;
```

### title {#title-PropertySignature}

Heading text content.

#### Signature

```typescript
title: string;
```
