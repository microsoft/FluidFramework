
# DocExample

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter) &gt; [RenderingHelpers](./api-markdown-documenter/renderinghelpers-namespace)

## Signature

```typescript
export interface DocExample 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [content](./api-markdown-documenter/renderinghelpers/docexample-interface#content-PropertySignature) |  | DocSection | <code>@example</code> comment body. |
|  [exampleNumber](./api-markdown-documenter/renderinghelpers/docexample-interface#examplenumber-PropertySignature) |  | number | Example number. Used to disambiguate multiple <code>@example</code> comments numerically. If not specified, example heading will not be labeled with a number. |

## Property Details

### content {#content-PropertySignature}

`@example` comment body.

#### Signature

```typescript
content: DocSection;
```

### exampleNumber {#examplenumber-PropertySignature}

Example number. Used to disambiguate multiple `@example` comments numerically. If not specified, example heading will not be labeled with a number.

#### Signature

```typescript
exampleNumber?: number;
```
