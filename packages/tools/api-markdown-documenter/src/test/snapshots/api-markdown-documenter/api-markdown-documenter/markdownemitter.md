
# MarkdownEmitter

[(model)](docs/index) &gt; [@fluid-tools/api-markdown-documenter](docs/api-markdown-documenter)

Markdown documentation emitter. Processes an input tree of documentation related to an API model, and generates Markdown content from it.

## Signature

```typescript
export declare class MarkdownEmitter extends BaseMarkdownEmitter 
```
<b>Extends:</b> BaseMarkdownEmitter


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(apiModel)](docs/api-markdown-documenter/markdownemitter#_constructor_-Constructor) |  |  | Constructs a new instance of the <code>MarkdownEmitter</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiModel](docs/api-markdown-documenter/markdownemitter#apimodel-Property) |  | ApiModel |  |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [emit(stringBuilder, docNode, options)](docs/api-markdown-documenter/markdownemitter#emit-Method) |  | string |  |
|  [writeEmphasisSpan(docEmphasisSpan, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter#writeemphasisspan-Method) |  | void |  |
|  [writeHeading(docHeading, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter#writeheading-Method) |  | void |  |
|  [writeLinkTagWithCodeDestination(docLinkTag, context)](docs/api-markdown-documenter/markdownemitter#writelinktagwithcodedestination-Method) |  | void |  |
|  [writeNode(docNode, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter#writenode-Method) |  | void |  |
|  [writeNoteBox(docNoteBox, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter#writenotebox-Method) |  | void |  |
|  [writeTable(docTable, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter#writetable-Method) |  | void |  |

## Constructor Details

### (constructor) {#_constructor_-Constructor}

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

### apiModel {#apimodel-Property}

#### Signature

```typescript
protected readonly apiModel: ApiModel;
```

## Method Details

### emit {#emit-Method}


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
|  options | [EmitterOptions](docs/api-markdown-documenter/emitteroptions) |  |

### writeEmphasisSpan {#writeemphasisspan-Method}


#### Signature

```typescript
/** @virtual */
protected writeEmphasisSpan(docEmphasisSpan: DocEmphasisSpan, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docEmphasisSpan | DocEmphasisSpan |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |
|  docNodeSiblings | boolean |  |

### writeHeading {#writeheading-Method}


#### Signature

```typescript
/** @virtual */
protected writeHeading(docHeading: DocHeading, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docHeading | [DocHeading](docs/api-markdown-documenter/docheading) |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |
|  docNodeSiblings | boolean |  |

### writeLinkTagWithCodeDestination {#writelinktagwithcodedestination-Method}


#### Signature

```typescript
/** @virtual @override */
protected writeLinkTagWithCodeDestination(docLinkTag: DocLinkTag, context: EmitterContext): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docLinkTag | DocLinkTag |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |

### writeNode {#writenode-Method}


#### Signature

```typescript
/** @override */
protected writeNode(docNode: DocNode, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docNode | DocNode |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |
|  docNodeSiblings | boolean |  |

### writeNoteBox {#writenotebox-Method}


#### Signature

```typescript
/** @virtual */
protected writeNoteBox(docNoteBox: DocNoteBox, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docNoteBox | DocNoteBox |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |
|  docNodeSiblings | boolean |  |

### writeTable {#writetable-Method}


#### Signature

```typescript
/** @virtual */
protected writeTable(docTable: DocTable, context: EmitterContext, docNodeSiblings: boolean): void;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  docTable | DocTable |  |
|  context | [EmitterContext](docs/api-markdown-documenter#emittercontext-TypeAlias) |  |
|  docNodeSiblings | boolean |  |

