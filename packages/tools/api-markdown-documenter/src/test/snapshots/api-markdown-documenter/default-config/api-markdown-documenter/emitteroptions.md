
# EmitterOptions

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

[MarkdownEmitter](./api-markdown-documenter/markdownemitter) options.

## Signature

```typescript
export interface EmitterOptions extends BaseEmitterOptions 
```
<b>Extends:</b> BaseEmitterOptions


## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [contextApiItem](./api-markdown-documenter/emitteroptions#contextapiitem-PropertySignature) |  | ApiItem \| undefined | The root item of the documentation node tree being emitted. |
|  [getLinkUrlApiItem](./api-markdown-documenter/emitteroptions#getlinkurlapiitem-PropertySignature) |  | (apiItem: ApiItem) =&gt; string \| undefined | Callback to get the link URL for the specified API item. |
|  [headingLevel](./api-markdown-documenter/emitteroptions#headinglevel-PropertySignature) |  | number | Contextual heading level. Will automatically increment based on <code>Section</code> items encountered such that heading levels can be increased automatically based on content hierarchy. |

## Property Details

### contextApiItem {#contextapiitem-PropertySignature}

The root item of the documentation node tree being emitted.

#### Signature

```typescript
contextApiItem: ApiItem | undefined;
```

### getLinkUrlApiItem {#getlinkurlapiitem-PropertySignature}

Callback to get the link URL for the specified API item.

#### Remarks

Used when resolving member links.

#### Signature

```typescript
getLinkUrlApiItem: (apiItem: ApiItem) => string | undefined;
```

### headingLevel {#headinglevel-PropertySignature}

Contextual heading level. Will automatically increment based on `Section` items encountered such that heading levels can be increased automatically based on content hierarchy.

#### Remarks

When invoking the Emitter externally, this should be set to 0 to represent having not entered any `Section`<!-- -->s yet.

#### Signature

```typescript
headingLevel?: number;
```
