
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
|  [(constructor)(parameters)](./api-markdown-documenter/docheading#_constructor_-Constructor) |  |  | Constructs a new instance of the <code>DocHeading</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [id](./api-markdown-documenter/docheading#id-Property) |  | string | Heading ID. If not specified, no explicit ID will be associated with the heading. |
|  [kind](./api-markdown-documenter/docheading#kind-Property) |  | string |  |
|  [level](./api-markdown-documenter/docheading#level-Property) |  | number | Level of the heading. If not specified, it will be automatically generated based on context. |
|  [title](./api-markdown-documenter/docheading#title-Property) |  | string | Heading text content. |

## Constructor Details

### (constructor) {#_constructor_-Constructor}

Constructs a new instance of the `DocHeading` class

#### Signature

```typescript
constructor(parameters: IDocHeadingParameters);
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  parameters | [IDocHeadingParameters](./api-markdown-documenter#idocheadingparameters-TypeAlias) |  |

## Property Details

### id {#id-Property}

Heading ID. If not specified, no explicit ID will be associated with the heading.

#### Signature

```typescript
readonly id?: string;
```

### kind {#kind-Property}


#### Signature

```typescript
/** @override */
get kind(): string;
```

### level {#level-Property}

Level of the heading. If not specified, it will be automatically generated based on context.

#### Signature

```typescript
readonly level?: number;
```

### title {#title-Property}

Heading text content.

#### Signature

```typescript
readonly title: string;
```
