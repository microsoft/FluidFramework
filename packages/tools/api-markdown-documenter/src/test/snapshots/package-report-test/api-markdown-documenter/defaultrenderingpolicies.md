
# DefaultRenderingPolicies

[(model)](docs/index) &gt; [@fluid-tools/api-markdown-documenter](docs/api-markdown-documenter)

## Signature

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [renderClassSection(apiClass, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#renderclasssection-Function) |  | DocSection |  |
|  [renderEnumSection(apiEnum, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#renderenumsection-Function) |  | DocSection |  |
|  [renderFunctionLikeSection(apiFunctionLike, config)](docs/api-markdown-documenter/defaultrenderingpolicies#renderfunctionlikesection-Function) |  | DocSection |  |
|  [renderInterfaceSection(apiInterface, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#renderinterfacesection-Function) |  | DocSection |  |
|  [renderItemWithoutChildren(apiItem, config)](docs/api-markdown-documenter/defaultrenderingpolicies#renderitemwithoutchildren-Function) |  | DocSection |  |
|  [renderModelSection(apiModel, config)](docs/api-markdown-documenter/defaultrenderingpolicies#rendermodelsection-Function) |  | DocSection |  |
|  [renderModuleLikeSection(apiItem, childItems, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#rendermodulelikesection-Function) |  | DocSection |  |
|  [renderNamespaceSection(apiNamespace, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#rendernamespacesection-Function) |  | DocSection |  |
|  [renderPackageSection(apiPackage, config, renderChild)](docs/api-markdown-documenter/defaultrenderingpolicies#renderpackagesection-Function) |  | DocSection |  |
|  [renderSectionBlock(apiItem, innerSectionBody, config)](docs/api-markdown-documenter/defaultrenderingpolicies#rendersectionblock-Function) |  | DocSection | Default rendering format for API item sections. Wraps the item-kind-specific details in the following manner:<!-- -->1. Heading (if not the document-root item) 1. Beta warning (if item annotated with <code>@beta</code>) 1. Deprecation notice (if any) 1. Summary (if any) 1. Remarks (if any) 1. Examples (if any) 1. Item Signature 1. <code>innerSectionBody</code> |

## Function Details

### renderClassSection {#renderclasssection-Function}

#### Signature

```typescript
export declare function renderClassSection(apiClass: ApiClass, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiClass | ApiClass |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderEnumSection {#renderenumsection-Function}

#### Signature

```typescript
export declare function renderEnumSection(apiEnum: ApiEnum, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiEnum | ApiEnum |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderFunctionLikeSection {#renderfunctionlikesection-Function}

#### Signature

```typescript
export declare function renderFunctionLikeSection(apiFunctionLike: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiFunctionLike | [ApiFunctionLike](docs/api-markdown-documenter#apifunctionlike-TypeAlias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderInterfaceSection {#renderinterfacesection-Function}

#### Signature

```typescript
export declare function renderInterfaceSection(apiInterface: ApiInterface, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiInterface | ApiInterface |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderItemWithoutChildren {#renderitemwithoutchildren-Function}

#### Signature

```typescript
export declare function renderItemWithoutChildren(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderModelSection {#rendermodelsection-Function}

#### Signature

```typescript
export declare function renderModelSection(apiModel: ApiModel, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiModel | ApiModel |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderModuleLikeSection {#rendermodulelikesection-Function}

#### Signature

```typescript
export declare function renderModuleLikeSection(apiItem: ApiModuleLike, childItems: readonly ApiItem[], config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | [ApiModuleLike](docs/api-markdown-documenter#apimodulelike-TypeAlias) |  |
|  childItems | readonly ApiItem\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderNamespaceSection {#rendernamespacesection-Function}

#### Signature

```typescript
export declare function renderNamespaceSection(apiNamespace: ApiNamespace, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiNamespace | ApiNamespace |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderPackageSection {#renderpackagesection-Function}

#### Signature

```typescript
export declare function renderPackageSection(apiPackage: ApiPackage, config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: ApiItem) => DocSection): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiPackage | ApiPackage |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
|  renderChild | (apiItem: ApiItem) =&gt; DocSection |  |

### renderSectionBlock {#rendersectionblock-Function}

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
|  config | Required&lt;[MarkdownDocumenterConfiguration](docs/api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; | TODO |

