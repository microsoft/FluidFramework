
# DocHeading

Represents a section header similar to an HTML `<h1>` or `<h2>` element.

## Signature

```typescript
export declare class DocHeading extends DocNode 
```
<b>Extends:</b> DocNode


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(parameters)](docs/api-markdown-documenter/docheading-_constructor_-constructor) |  |  | Constructs a new instance of the <code>DocHeading</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [id](docs/api-markdown-documenter/docheading-id-property) |  | string | Heading ID. If not specified, no explicit ID will be associated with the heading. |
|  [kind](docs/api-markdown-documenter/docheading-kind-property) |  | string |  |
|  [level](docs/api-markdown-documenter/docheading-level-property) |  | number | Level of the heading. If not specified, it will be automatically generated based on context. |
|  [title](docs/api-markdown-documenter/docheading-title-property) |  | string | Heading text content. |

