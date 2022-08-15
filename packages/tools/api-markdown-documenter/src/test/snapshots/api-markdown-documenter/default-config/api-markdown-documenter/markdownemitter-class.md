
# MarkdownEmitter

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Markdown documentation emitter. Processes an input tree of documentation related to an API model, and generates Markdown content from it.

## Signature

```typescript
export declare class MarkdownEmitter extends BaseMarkdownEmitter 
```
<b>Extends:</b> BaseMarkdownEmitter


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(apiModel)](./api-markdown-documenter/markdownemitter-class#_constructor_-constructor) |  |  | Constructs a new instance of the <code>MarkdownEmitter</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiModel](./api-markdown-documenter/markdownemitter-class#apimodel-property) |  | ApiModel |  |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [emit(stringBuilder, docNode, options)](./api-markdown-documenter/markdownemitter-class#emit-method) |  | string |  |
|  [writeEmphasisSpan(docEmphasisSpan, context, docNodeSiblings)](./api-markdown-documenter/markdownemitter-class#writeemphasisspan-method) |  | void |  |
|  [writeHeading(docHeading, context, docNodeSiblings)](./api-markdown-documenter/markdownemitter-class#writeheading-method) |  | void |  |
|  [writeLinkTagWithCodeDestination(docLinkTag, context)](./api-markdown-documenter/markdownemitter-class#writelinktagwithcodedestination-method) |  | void |  |
|  [writeNode(docNode, context, docNodeSiblings)](./api-markdown-documenter/markdownemitter-class#writenode-method) |  | void |  |
|  [writeNoteBox(docNoteBox, context, docNodeSiblings)](./api-markdown-documenter/markdownemitter-class#writenotebox-method) |  | void |  |
|  [writeTable(docTable, context, docNodeSiblings)](./api-markdown-documenter/markdownemitter-class#writetable-method) |  | void |  |

## Constructor Details

### (constructor) {#_constructor_-constructor}

Constructs a new instance of the `MarkdownEmitter` class

#### Signature

```typescript
constructor(apiModel: ApiModel);
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiModel | ApiModel |  |

## Property Details

### apiModel {#apimodel-property}

#### Signature

```typescript
protected readonly apiModel: ApiModel;
```

## Method Details

### emit {#emit-method}


#### Signature

```typescript
/** @override */
emit(stringBuilder: StringBuilder, docNode: DocNode, options: EmitterOptions): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  stringBuilder | StringBuilder |  |
|  docNode | DocNode |  |
|  options | [EmitterOptions](./api-markdown-documenter/emitteroptions-interface) |  |

### writeEmphasisSpan {#writeemphasisspan-method}


#### Signature

```typescript
/** @virtual */
protected writeEmphasisSpan(docEmphasisSpan: DocEmphasisSpan, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docEmphasisSpan | DocEmphasisSpan |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |
|  docNodeSiblings | boolean |  |

### writeHeading {#writeheading-method}


#### Signature

```typescript
/** @virtual */
protected writeHeading(docHeading: DocHeading, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docHeading | [DocHeading](./api-markdown-documenter/docheading-class) |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |
|  docNodeSiblings | boolean |  |

### writeLinkTagWithCodeDestination {#writelinktagwithcodedestination-method}


#### Signature

```typescript
/** @virtual @override */
protected writeLinkTagWithCodeDestination(docLinkTag: DocLinkTag, context: EmitterContext): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docLinkTag | DocLinkTag |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |

### writeNode {#writenode-method}


#### Signature

```typescript
/** @override */
protected writeNode(docNode: DocNode, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docNode | DocNode |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |
|  docNodeSiblings | boolean |  |

### writeNoteBox {#writenotebox-method}


#### Signature

```typescript
/** @virtual */
protected writeNoteBox(docNoteBox: DocNoteBox, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docNoteBox | DocNoteBox |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |
|  docNodeSiblings | boolean |  |

### writeTable {#writetable-method}


#### Signature

```typescript
/** @virtual */
protected writeTable(docTable: DocTable, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docTable | DocTable |  |
|  context | [EmitterContext](./api-markdown-documenter#emittercontext-typealias) |  |
|  docNodeSiblings | boolean |  |

