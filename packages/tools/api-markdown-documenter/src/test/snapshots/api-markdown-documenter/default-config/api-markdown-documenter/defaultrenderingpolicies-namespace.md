
# DefaultRenderingPolicies

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [renderClassSection(apiClass, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderclasssection-function) |  | DocSection |  |
|  [renderEnumSection(apiEnum, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderenumsection-function) |  | DocSection |  |
|  [renderFunctionLikeSection(apiFunctionLike, config)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderfunctionlikesection-function) |  | DocSection |  |
|  [renderInterfaceSection(apiInterface, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderinterfacesection-function) |  | DocSection |  |
|  [renderItemWithoutChildren(apiItem, config)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderitemwithoutchildren-function) |  | DocSection |  |
|  [renderModelSection(apiModel, config)](./api-markdown-documenter/defaultrenderingpolicies-namespace#rendermodelsection-function) |  | DocSection |  |
|  [renderModuleLikeSection(apiItem, childItems, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#rendermodulelikesection-function) |  | DocSection |  |
|  [renderNamespaceSection(apiNamespace, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#rendernamespacesection-function) |  | DocSection |  |
|  [renderPackageSection(apiPackage, config, renderChild)](./api-markdown-documenter/defaultrenderingpolicies-namespace#renderpackagesection-function) |  | DocSection |  |
|  [renderSectionBlock(apiItem, innerSectionBody, config)](./api-markdown-documenter/defaultrenderingpolicies-namespace#rendersectionblock-function) |  | DocSection | Default rendering format for API item sections. Wraps the item-kind-specific details in the following manner:<!-- -->1. Heading (if not the document-root item) 1. Beta warning (if item annotated with <code>@beta</code>) 1. Deprecation notice (if any) 1. Summary (if any) 1. Remarks (if any) 1. Examples (if any) 1. Item Signature 1. <code>innerSectionBody</code> |

## Function Details

### renderClassSection {#renderclasssection-function}

#### Signature

```typescript
export declare function renderClassSection(apiClass: ApiClass, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiClass | ApiClass |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderEnumSection {#renderenumsection-function}

#### Signature

```typescript
export declare function renderEnumSection(apiEnum: ApiEnum, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiEnum | ApiEnum |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderFunctionLikeSection {#renderfunctionlikesection-function}

#### Signature

```typescript
export declare function renderFunctionLikeSection(apiFunctionLike: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiFunctionLike | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-typealias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderInterfaceSection {#renderinterfacesection-function}

#### Signature

```typescript
export declare function renderInterfaceSection(apiInterface: ApiInterface, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiInterface | ApiInterface |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderItemWithoutChildren {#renderitemwithoutchildren-function}

#### Signature

```typescript
export declare function renderItemWithoutChildren(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderModelSection {#rendermodelsection-function}

#### Signature

```typescript
export declare function renderModelSection(apiModel: ApiModel, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiModel | ApiModel |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderModuleLikeSection {#rendermodulelikesection-function}

#### Signature

```typescript
export declare function renderModuleLikeSection(apiItem: ApiModuleLike, childItems: readonly ApiItem[], config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | [ApiModuleLike](./api-markdown-documenter#apimodulelike-typealias) |  |
|  childItems | readonly ApiItem\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderNamespaceSection {#rendernamespacesection-function}

#### Signature

```typescript
export declare function renderNamespaceSection(apiNamespace: ApiNamespace, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiNamespace | ApiNamespace |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderPackageSection {#renderpackagesection-function}

#### Signature

```typescript
export declare function renderPackageSection(apiPackage: ApiPackage, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiPackage | ApiPackage |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderSectionBlock {#rendersectionblock-function}

Default rendering format for API item sections. Wraps the item-kind-specific details in the following manner:

1. Heading (if not the document-root item) 1. Beta warning (if item annotated with `@beta`<!-- -->) 1. Deprecation notice (if any) 1. Summary (if any) 1. Remarks (if any) 1. Examples (if any) 1. Item Signature 1. `innerSectionBody`

#### Signature

```typescript
export declare function renderSectionBlock(apiItem: ApiItem, innerSectionBody: DocSection | undefined, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem | TODO |
|  innerSectionBody | DocSection \| undefined | TODO |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; | TODO |

