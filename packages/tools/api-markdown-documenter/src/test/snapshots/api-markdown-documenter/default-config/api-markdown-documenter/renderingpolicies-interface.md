
# RenderingPolicies

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

TODO

## Signature

```typescript
export interface RenderingPolicies 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [renderCallSignatureSection](./api-markdown-documenter/renderingpolicies-interface#rendercallsignaturesection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiCallSignature&gt; |  |
|  [renderClassSection](./api-markdown-documenter/renderingpolicies-interface#renderclasssection-propertysignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-typealias)<!-- -->&lt;ApiClass&gt; |  |
|  [renderConstructorSection](./api-markdown-documenter/renderingpolicies-interface#renderconstructorsection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiConstructSignature \| ApiConstructor&gt; |  |
|  [renderEnumMemberSection](./api-markdown-documenter/renderingpolicies-interface#renderenummembersection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiEnumMember&gt; |  |
|  [renderEnumSection](./api-markdown-documenter/renderingpolicies-interface#renderenumsection-propertysignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-typealias)<!-- -->&lt;ApiEnum&gt; |  |
|  [renderFunctionSection](./api-markdown-documenter/renderingpolicies-interface#renderfunctionsection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiFunction&gt; |  |
|  [renderIndexSignatureSection](./api-markdown-documenter/renderingpolicies-interface#renderindexsignaturesection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiIndexSignature&gt; |  |
|  [renderInterfaceSection](./api-markdown-documenter/renderingpolicies-interface#renderinterfacesection-propertysignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-typealias)<!-- -->&lt;ApiInterface&gt; |  |
|  [renderMethodSection](./api-markdown-documenter/renderingpolicies-interface#rendermethodsection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiMethod \| ApiMethodSignature&gt; |  |
|  [renderModelSection](./api-markdown-documenter/renderingpolicies-interface#rendermodelsection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiModel&gt; | Policy for rendering a section describing a <code>Model</code>. |
|  [renderNamespaceSection](./api-markdown-documenter/renderingpolicies-interface#rendernamespacesection-propertysignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-typealias)<!-- -->&lt;ApiNamespace&gt; |  |
|  [renderPackageSection](./api-markdown-documenter/renderingpolicies-interface#renderpackagesection-propertysignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-typealias)<!-- -->&lt;ApiPackage&gt; |  |
|  [renderPropertySection](./api-markdown-documenter/renderingpolicies-interface#renderpropertysection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiPropertyItem&gt; |  |
|  [renderSectionBlock](./api-markdown-documenter/renderingpolicies-interface#rendersectionblock-propertysignature) |  | [RenderSectionBlock](./api-markdown-documenter#rendersectionblock-typealias) |  |
|  [renderTypeAliasSection](./api-markdown-documenter/renderingpolicies-interface#rendertypealiassection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiTypeAlias&gt; |  |
|  [renderVariableSection](./api-markdown-documenter/renderingpolicies-interface#rendervariablesection-propertysignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-typealias)<!-- -->&lt;ApiVariable&gt; |  |

## Property Details

### renderCallSignatureSection {#rendercallsignaturesection-propertysignature}

#### Signature

```typescript
renderCallSignatureSection?: RenderApiItemWithoutChildren<ApiCallSignature>;
```

### renderClassSection {#renderclasssection-propertysignature}

#### Signature

```typescript
renderClassSection?: RenderApiItemWithChildren<ApiClass>;
```

### renderConstructorSection {#renderconstructorsection-propertysignature}

#### Signature

```typescript
renderConstructorSection?: RenderApiItemWithoutChildren<ApiConstructSignature | ApiConstructor>;
```

### renderEnumMemberSection {#renderenummembersection-propertysignature}

#### Signature

```typescript
renderEnumMemberSection?: RenderApiItemWithoutChildren<ApiEnumMember>;
```

### renderEnumSection {#renderenumsection-propertysignature}

#### Signature

```typescript
renderEnumSection?: RenderApiItemWithChildren<ApiEnum>;
```

### renderFunctionSection {#renderfunctionsection-propertysignature}

#### Signature

```typescript
renderFunctionSection?: RenderApiItemWithoutChildren<ApiFunction>;
```

### renderIndexSignatureSection {#renderindexsignaturesection-propertysignature}

#### Signature

```typescript
renderIndexSignatureSection?: RenderApiItemWithoutChildren<ApiIndexSignature>;
```

### renderInterfaceSection {#renderinterfacesection-propertysignature}

#### Signature

```typescript
renderInterfaceSection?: RenderApiItemWithChildren<ApiInterface>;
```

### renderMethodSection {#rendermethodsection-propertysignature}

#### Signature

```typescript
renderMethodSection?: RenderApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;
```

### renderModelSection {#rendermodelsection-propertysignature}

Policy for rendering a section describing a `Model`<!-- -->.

#### Signature

```typescript
renderModelSection?: RenderApiItemWithoutChildren<ApiModel>;
```

### renderNamespaceSection {#rendernamespacesection-propertysignature}

#### Signature

```typescript
renderNamespaceSection?: RenderApiItemWithChildren<ApiNamespace>;
```

### renderPackageSection {#renderpackagesection-propertysignature}

#### Signature

```typescript
renderPackageSection?: RenderApiItemWithChildren<ApiPackage>;
```

### renderPropertySection {#renderpropertysection-propertysignature}

#### Signature

```typescript
renderPropertySection?: RenderApiItemWithoutChildren<ApiPropertyItem>;
```

### renderSectionBlock {#rendersectionblock-propertysignature}

#### Signature

```typescript
renderSectionBlock?: RenderSectionBlock;
```

### renderTypeAliasSection {#rendertypealiassection-propertysignature}

#### Signature

```typescript
renderTypeAliasSection?: RenderApiItemWithoutChildren<ApiTypeAlias>;
```

### renderVariableSection {#rendervariablesection-propertysignature}

#### Signature

```typescript
renderVariableSection?: RenderApiItemWithoutChildren<ApiVariable>;
```
