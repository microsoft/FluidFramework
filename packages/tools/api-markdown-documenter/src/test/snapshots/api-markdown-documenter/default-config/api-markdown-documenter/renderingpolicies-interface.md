
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
|  [renderCallSignatureSection](./api-markdown-documenter/renderingpolicies-interface#rendercallsignaturesection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiCallSignature&gt; |  |
|  [renderClassSection](./api-markdown-documenter/renderingpolicies-interface#renderclasssection-PropertySignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiClass&gt; |  |
|  [renderConstructorSection](./api-markdown-documenter/renderingpolicies-interface#renderconstructorsection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiConstructSignature \| ApiConstructor&gt; |  |
|  [renderEnumMemberSection](./api-markdown-documenter/renderingpolicies-interface#renderenummembersection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiEnumMember&gt; |  |
|  [renderEnumSection](./api-markdown-documenter/renderingpolicies-interface#renderenumsection-PropertySignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiEnum&gt; |  |
|  [renderFunctionSection](./api-markdown-documenter/renderingpolicies-interface#renderfunctionsection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiFunction&gt; |  |
|  [renderIndexSignatureSection](./api-markdown-documenter/renderingpolicies-interface#renderindexsignaturesection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiIndexSignature&gt; |  |
|  [renderInterfaceSection](./api-markdown-documenter/renderingpolicies-interface#renderinterfacesection-PropertySignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiInterface&gt; |  |
|  [renderMethodSection](./api-markdown-documenter/renderingpolicies-interface#rendermethodsection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiMethod \| ApiMethodSignature&gt; |  |
|  [renderModelSection](./api-markdown-documenter/renderingpolicies-interface#rendermodelsection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiModel&gt; | Policy for rendering a section describing a <code>Model</code>. |
|  [renderNamespaceSection](./api-markdown-documenter/renderingpolicies-interface#rendernamespacesection-PropertySignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiNamespace&gt; |  |
|  [renderPackageSection](./api-markdown-documenter/renderingpolicies-interface#renderpackagesection-PropertySignature) |  | [RenderApiItemWithChildren](./api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiPackage&gt; |  |
|  [renderPropertySection](./api-markdown-documenter/renderingpolicies-interface#renderpropertysection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiPropertyItem&gt; |  |
|  [renderSectionBlock](./api-markdown-documenter/renderingpolicies-interface#rendersectionblock-PropertySignature) |  | [RenderSectionBlock](./api-markdown-documenter#rendersectionblock-TypeAlias) |  |
|  [renderTypeAliasSection](./api-markdown-documenter/renderingpolicies-interface#rendertypealiassection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiTypeAlias&gt; |  |
|  [renderVariableSection](./api-markdown-documenter/renderingpolicies-interface#rendervariablesection-PropertySignature) |  | [RenderApiItemWithoutChildren](./api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiVariable&gt; |  |

## Property Details

### renderCallSignatureSection {#rendercallsignaturesection-PropertySignature}

#### Signature

```typescript
renderCallSignatureSection?: RenderApiItemWithoutChildren<ApiCallSignature>;
```

### renderClassSection {#renderclasssection-PropertySignature}

#### Signature

```typescript
renderClassSection?: RenderApiItemWithChildren<ApiClass>;
```

### renderConstructorSection {#renderconstructorsection-PropertySignature}

#### Signature

```typescript
renderConstructorSection?: RenderApiItemWithoutChildren<ApiConstructSignature | ApiConstructor>;
```

### renderEnumMemberSection {#renderenummembersection-PropertySignature}

#### Signature

```typescript
renderEnumMemberSection?: RenderApiItemWithoutChildren<ApiEnumMember>;
```

### renderEnumSection {#renderenumsection-PropertySignature}

#### Signature

```typescript
renderEnumSection?: RenderApiItemWithChildren<ApiEnum>;
```

### renderFunctionSection {#renderfunctionsection-PropertySignature}

#### Signature

```typescript
renderFunctionSection?: RenderApiItemWithoutChildren<ApiFunction>;
```

### renderIndexSignatureSection {#renderindexsignaturesection-PropertySignature}

#### Signature

```typescript
renderIndexSignatureSection?: RenderApiItemWithoutChildren<ApiIndexSignature>;
```

### renderInterfaceSection {#renderinterfacesection-PropertySignature}

#### Signature

```typescript
renderInterfaceSection?: RenderApiItemWithChildren<ApiInterface>;
```

### renderMethodSection {#rendermethodsection-PropertySignature}

#### Signature

```typescript
renderMethodSection?: RenderApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;
```

### renderModelSection {#rendermodelsection-PropertySignature}

Policy for rendering a section describing a `Model`<!-- -->.

#### Signature

```typescript
renderModelSection?: RenderApiItemWithoutChildren<ApiModel>;
```

### renderNamespaceSection {#rendernamespacesection-PropertySignature}

#### Signature

```typescript
renderNamespaceSection?: RenderApiItemWithChildren<ApiNamespace>;
```

### renderPackageSection {#renderpackagesection-PropertySignature}

#### Signature

```typescript
renderPackageSection?: RenderApiItemWithChildren<ApiPackage>;
```

### renderPropertySection {#renderpropertysection-PropertySignature}

#### Signature

```typescript
renderPropertySection?: RenderApiItemWithoutChildren<ApiPropertyItem>;
```

### renderSectionBlock {#rendersectionblock-PropertySignature}

#### Signature

```typescript
renderSectionBlock?: RenderSectionBlock;
```

### renderTypeAliasSection {#rendertypealiassection-PropertySignature}

#### Signature

```typescript
renderTypeAliasSection?: RenderApiItemWithoutChildren<ApiTypeAlias>;
```

### renderVariableSection {#rendervariablesection-PropertySignature}

#### Signature

```typescript
renderVariableSection?: RenderApiItemWithoutChildren<ApiVariable>;
```
