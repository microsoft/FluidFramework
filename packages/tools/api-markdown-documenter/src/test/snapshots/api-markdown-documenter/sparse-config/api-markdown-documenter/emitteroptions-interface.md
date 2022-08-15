
# EmitterOptions

[MarkdownEmitter](docs/api-markdown-documenter/markdownemitter-class) options.

## Signature

```typescript
export interface EmitterOptions extends BaseEmitterOptions 
```
<b>Extends:</b> BaseEmitterOptions


## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [contextApiItem](docs/api-markdown-documenter/emitteroptions-contextapiitem-propertysignature) |  | ApiItem \| undefined | The root item of the documentation node tree being emitted. |
|  [getLinkUrlApiItem](docs/api-markdown-documenter/emitteroptions-getlinkurlapiitem-propertysignature) |  | (apiItem: ApiItem) =&gt; string \| undefined | Callback to get the link URL for the specified API item. |
|  [headingLevel](docs/api-markdown-documenter/emitteroptions-headinglevel-propertysignature) |  | number | Contextual heading level. Will automatically increment based on <code>Section</code> items encountered such that heading levels can be increased automatically based on content hierarchy. |

