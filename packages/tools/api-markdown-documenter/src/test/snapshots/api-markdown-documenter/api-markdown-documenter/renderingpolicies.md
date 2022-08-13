
# RenderingPolicies

[(model)](docs/index) &gt; [@fluid-tools/api-markdown-documenter](docs/api-markdown-documenter)

TODO

## Signature

```typescript
export interface RenderingPolicies 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [renderCallSignatureSection](docs/api-markdown-documenter/renderingpolicies#rendercallsignaturesection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiCallSignature&gt; |  |
|  [renderClassSection](docs/api-markdown-documenter/renderingpolicies#renderclasssection-PropertySignature) |  | [RenderApiItemWithChildren](docs/api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiClass&gt; |  |
|  [renderConstructorSection](docs/api-markdown-documenter/renderingpolicies#renderconstructorsection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiConstructSignature \| ApiConstructor&gt; |  |
|  [renderEnumMemberSection](docs/api-markdown-documenter/renderingpolicies#renderenummembersection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiEnumMember&gt; |  |
|  [renderEnumSection](docs/api-markdown-documenter/renderingpolicies#renderenumsection-PropertySignature) |  | [RenderApiItemWithChildren](docs/api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiEnum&gt; |  |
|  [renderFunctionSection](docs/api-markdown-documenter/renderingpolicies#renderfunctionsection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiFunction&gt; |  |
|  [renderIndexSignatureSection](docs/api-markdown-documenter/renderingpolicies#renderindexsignaturesection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiIndexSignature&gt; |  |
|  [renderInterfaceSection](docs/api-markdown-documenter/renderingpolicies#renderinterfacesection-PropertySignature) |  | [RenderApiItemWithChildren](docs/api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiInterface&gt; |  |
|  [renderMethodSection](docs/api-markdown-documenter/renderingpolicies#rendermethodsection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiMethod \| ApiMethodSignature&gt; |  |
|  [renderModelSection](docs/api-markdown-documenter/renderingpolicies#rendermodelsection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiModel&gt; | Policy for rendering a section describing a <code>Model</code>. |
|  [renderNamespaceSection](docs/api-markdown-documenter/renderingpolicies#rendernamespacesection-PropertySignature) |  | [RenderApiItemWithChildren](docs/api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiNamespace&gt; |  |
|  [renderPackageSection](docs/api-markdown-documenter/renderingpolicies#renderpackagesection-PropertySignature) |  | [RenderApiItemWithChildren](docs/api-markdown-documenter#renderapiitemwithchildren-TypeAlias)<!-- -->&lt;ApiPackage&gt; |  |
|  [renderPropertySection](docs/api-markdown-documenter/renderingpolicies#renderpropertysection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiPropertyItem&gt; |  |
|  [renderSectionBlock](docs/api-markdown-documenter/renderingpolicies#rendersectionblock-PropertySignature) |  | [RenderSectionBlock](docs/api-markdown-documenter#rendersectionblock-TypeAlias) |  |
|  [renderTypeAliasSection](docs/api-markdown-documenter/renderingpolicies#rendertypealiassection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiTypeAlias&gt; |  |
|  [renderVariableSection](docs/api-markdown-documenter/renderingpolicies#rendervariablesection-PropertySignature) |  | [RenderApiItemWithoutChildren](docs/api-markdown-documenter#renderapiitemwithoutchildren-TypeAlias)<!-- -->&lt;ApiVariable&gt; |  |

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
