
# DefaultRenderingPolicies

## Signature

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [renderClassSection(apiClass, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-renderclasssection-function) |  | DocSection |  |
|  [renderEnumSection(apiEnum, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-renderenumsection-function) |  | DocSection |  |
|  [renderFunctionLikeSection(apiFunctionLike, config)](docs/api-markdown-documenter/defaultrenderingpolicies-renderfunctionlikesection-function) |  | DocSection |  |
|  [renderInterfaceSection(apiInterface, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-renderinterfacesection-function) |  | DocSection |  |
|  [renderItemWithoutChildren(apiItem, config)](docs/api-markdown-documenter/defaultrenderingpolicies-renderitemwithoutchildren-function) |  | DocSection |  |
|  [renderModelSection(apiModel, config)](docs/api-markdown-documenter/defaultrenderingpolicies-rendermodelsection-function) |  | DocSection |  |
|  [renderModuleLikeSection(apiItem, childItems, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-rendermodulelikesection-function) |  | DocSection |  |
|  [renderNamespaceSection(apiNamespace, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-rendernamespacesection-function) |  | DocSection |  |
|  [renderPackageSection(apiPackage, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies-renderpackagesection-function) |  | DocSection |  |
|  [renderSectionBlock(apiItem, innerSectionBody, config)](docs/api-markdown-documenter/defaultrenderingpolicies-rendersectionblock-function) |  | DocSection | Default rendering format for API item sections. Wraps the item-kind-specific details in the following manner:<!-- -->1. Heading (if not the document-root item) 1. Beta warning (if item annotated with <code>@beta</code>) 1. Deprecation notice (if any) 1. Summary (if any) 1. Remarks (if any) 1. Examples (if any) 1. Item Signature 1. <code>innerSectionBody</code> |

