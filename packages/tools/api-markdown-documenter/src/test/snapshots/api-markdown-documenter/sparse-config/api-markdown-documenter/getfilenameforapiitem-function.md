
# getFileNameForApiItem

Gets the file name for the specified API item.

## Remarks

In the case of an item that does not get rendered to its own page, this will be the file name for the document of the ancestor item under which the provided item will be rendered.

Note: This is strictly the name of the file, not a path to that file. To get the path, use [getFilePathForApiItem()](docs/api-markdown-documenter/getfilepathforapiitem-function)<!-- -->.

## Signature

```typescript
export declare function getFileNameForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>, includeExtension: boolean): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | The API item for which we are generating a file path. |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | See [MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration-interface) |
|  includeExtension | boolean | Whether or not to include the <code>.md</code> file extension at the end of the file name. |

