
# getFilePathForApiItem

Gets the file path for the specified API item.

## Remarks

In the case of an item that does not get rendered to its own page, this will point to the document of the ancestor item under which the provided item will be rendered.

The generated path is relative to [MarkdownDocumenterConfiguration.uriRoot](docs/api-markdown-documenter/markdowndocumenterconfiguration-uriroot-propertysignature)<!-- -->.

## Signature

```typescript
export declare function getFilePathForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>, includeExtension: boolean): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which we are generating a file path. |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | See [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface) |
|  includeExtension | boolean | Whether or not to include the <code>.md</code> file extension at the end of the path. |

