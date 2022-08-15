
# MarkdownEmitter

Markdown documentation emitter. Processes an input tree of documentation related to an API model, and generates Markdown content from it.

## Signature

```typescript
export declare class MarkdownEmitter extends BaseMarkdownEmitter 
```
<b>Extends:</b> BaseMarkdownEmitter


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(apiModel)](docs/api-markdown-documenter/markdownemitter-_constructor_-constructor) |  |  | Constructs a new instance of the <code>MarkdownEmitter</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiModel](docs/api-markdown-documenter/markdownemitter-apimodel-property) |  | ApiModel |  |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [emit(stringBuilder, docNode, options)](docs/api-markdown-documenter/markdownemitter-emit-method) |  | string |  |
|  [writeEmphasisSpan(docEmphasisSpan, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter-writeemphasisspan-method) |  | void |  |
|  [writeHeading(docHeading, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter-writeheading-method) |  | void |  |
|  [writeLinkTagWithCodeDestination(docLinkTag, context)](docs/api-markdown-documenter/markdownemitter-writelinktagwithcodedestination-method) |  | void |  |
|  [writeNode(docNode, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter-writenode-method) |  | void |  |
|  [writeNoteBox(docNoteBox, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter-writenotebox-method) |  | void |  |
|  [writeTable(docTable, context, docNodeSiblings)](docs/api-markdown-documenter/markdownemitter-writetable-method) |  | void |  |

