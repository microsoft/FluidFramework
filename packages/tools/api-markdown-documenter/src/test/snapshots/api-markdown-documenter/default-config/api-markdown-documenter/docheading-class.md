
# DocHeading

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Represents a section header similar to an HTML `<h1>` or `<h2>` element.

## Signature

```typescript
export declare class DocHeading extends DocNode 
```
<b>Extends:</b> DocNode


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(parameters)](./api-markdown-documenter/docheading-class#_constructor_-constructor) |  |  | Constructs a new instance of the <code>DocHeading</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [id](./api-markdown-documenter/docheading-class#id-property) |  | string | Heading ID. If not specified, no explicit ID will be associated with the heading. |
|  [kind](./api-markdown-documenter/docheading-class#kind-property) |  | string |  |
|  [level](./api-markdown-documenter/docheading-class#level-property) |  | number | Level of the heading. If not specified, it will be automatically generated based on context. |
|  [title](./api-markdown-documenter/docheading-class#title-property) |  | string | Heading text content. |

## Constructor Details

### (constructor) {#_constructor_-constructor}

Constructs a new instance of the `DocHeading` class

#### Signature

```typescript
constructor(parameters: IDocHeadingParameters);
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  parameters | [IDocHeadingParameters](./api-markdown-documenter#idocheadingparameters-typealias) |  |

## Property Details

### id {#id-property}

Heading ID. If not specified, no explicit ID will be associated with the heading.

#### Signature

```typescript
readonly id?: string;
```

### kind {#kind-property}


#### Signature

```typescript
/** @override */
get kind(): string;
```

### level {#level-property}

Level of the heading. If not specified, it will be automatically generated based on context.

#### Signature

```typescript
readonly level?: number;
```

### title {#title-property}

Heading text content.

#### Signature

```typescript
readonly title: string;
```
