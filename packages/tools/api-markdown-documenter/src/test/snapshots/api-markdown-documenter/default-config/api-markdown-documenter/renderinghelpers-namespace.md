
# RenderingHelpers

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

## Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [ChildSectionProperties](./api-markdown-documenter/renderinghelpers/childsectionproperties-interface) |  |  |
|  [DocExample](./api-markdown-documenter/renderinghelpers/docexample-interface) |  |  |
|  [MemberTableProperties](./api-markdown-documenter/renderinghelpers/membertableproperties-interface) |  |  |

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [renderApiSummaryCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderapisummarycell-Function) |  | DocTableCell |  |
|  [renderApiTitleCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderapititlecell-Function) |  | DocTableCell |  |
|  [renderBetaWarning(config)](./api-markdown-documenter/renderinghelpers-namespace#renderbetawarning-Function) |  | DocNoteBox |  |
|  [renderBreadcrumb(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderbreadcrumb-Function) |  | DocSection |  |
|  [renderChildDetailsSection(childSections, config, renderChild)](./api-markdown-documenter/renderinghelpers-namespace#renderchilddetailssection-Function) |  | DocSection \| undefined |  |
|  [renderChildrenUnderHeading(childItems, headingTitle, config, renderChild)](./api-markdown-documenter/renderinghelpers-namespace#renderchildrenunderheading-Function) |  | DocSection \| undefined |  |
|  [renderDefaultTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#renderdefaulttable-Function) |  | DocTable \| undefined |  |
|  [renderDeprecationNotice(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderdeprecationnotice-Function) |  | DocSection \| undefined |  |
|  [renderExample(example, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexample-Function) |  | DocSection |  |
|  [renderExamples(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexamples-Function) |  | DocSection \| undefined |  |
|  [renderExcerptWithHyperlinks(excerpt, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexcerptwithhyperlinks-Function) |  | DocParagraph |  |
|  [renderFunctionLikeTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#renderfunctionliketable-Function) |  | DocTable \| undefined |  |
|  [renderHeading(heading, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheading-Function) |  | [DocHeading](./api-markdown-documenter/docheading-class) |  |
|  [renderHeadingForApiItem(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheadingforapiitem-Function) |  | [DocHeading](./api-markdown-documenter/docheading-class) |  |
|  [renderHeritageTypes(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheritagetypes-Function) |  | DocSection \| undefined |  |
|  [renderMemberTables(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#rendermembertables-Function) |  | DocSection \| undefined |  |
|  [renderModifiersCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#rendermodifierscell-Function) |  | DocTableCell |  |
|  [renderPackagesTable(apiPackages, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpackagestable-Function) |  | DocTable \| undefined |  |
|  [renderParametersSection(apiFunctionLike, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparameterssection-Function) |  | DocSection \| undefined |  |
|  [renderParametersTable(apiParameters, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparameterstable-Function) |  | DocTable |  |
|  [renderParameterSummaryCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametersummarycell-Function) |  | DocTableCell |  |
|  [renderParameterTitleCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametertitlecell-Function) |  | DocTableCell |  |
|  [renderParameterTypeCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametertypecell-Function) |  | DocTableCell |  |
|  [renderPropertiesTable(apiProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpropertiestable-Function) |  | DocTable \| undefined |  |
|  [renderPropertyTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpropertytypecell-Function) |  | DocTableCell |  |
|  [renderRemarks(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderremarks-Function) |  | DocSection \| undefined |  |
|  [renderReturnTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderreturntypecell-Function) |  | DocTableCell |  |
|  [renderSignature(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#rendersignature-Function) |  | DocSection \| undefined |  |
|  [renderSummary(apiItem)](./api-markdown-documenter/renderinghelpers-namespace#rendersummary-Function) |  | DocSection \| undefined |  |
|  [renderTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertable-Function) |  | DocTable \| undefined |  |
|  [renderTableWithHeading(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertablewithheading-Function) |  | DocSection \| undefined |  |
|  [renderTypeParameters(typeParameters, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertypeparameters-Function) |  | DocSection \| undefined |  |

## Function Details

### renderApiSummaryCell {#renderapisummarycell-Function}

#### Signature

```typescript
export declare function renderApiSummaryCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderApiTitleCell {#renderapititlecell-Function}

#### Signature

```typescript
export declare function renderApiTitleCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderBetaWarning {#renderbetawarning-Function}

#### Signature

```typescript
export declare function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocNoteBox;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderBreadcrumb {#renderbreadcrumb-Function}

#### Signature

```typescript
export declare function renderBreadcrumb(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderChildDetailsSection {#renderchilddetailssection-Function}

#### Signature

```typescript
export declare function renderChildDetailsSection(childSections: readonly ChildSectionProperties[], config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: any) => DocSection): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  childSections | readonly ChildSectionProperties\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (apiItem: any) =&gt; DocSection |  |

### renderChildrenUnderHeading {#renderchildrenunderheading-Function}

#### Signature

```typescript
export declare function renderChildrenUnderHeading(childItems: readonly ApiItem[], headingTitle: string, config: Required<MarkdownDocumenterConfiguration>, renderChild: (childItem: ApiItem) => DocSection): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  childItems | readonly ApiItem\[\] |  |
|  headingTitle | string |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |
|  renderChild | (childItem: ApiItem) =&gt; DocSection |  |

### renderDefaultTable {#renderdefaulttable-Function}

#### Signature

```typescript
export declare function renderDefaultTable(apiItems: readonly ApiItem[], itemKind: ApiItemKind, config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItems | readonly ApiItem\[\] |  |
|  itemKind | ApiItemKind |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderDeprecationNotice {#renderdeprecationnotice-Function}

#### Signature

```typescript
export declare function renderDeprecationNotice(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExample {#renderexample-Function}

#### Signature

```typescript
export declare function renderExample(example: DocExample, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  example | DocExample |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExamples {#renderexamples-Function}

#### Signature

```typescript
export declare function renderExamples(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExcerptWithHyperlinks {#renderexcerptwithhyperlinks-Function}

#### Signature

```typescript
export declare function renderExcerptWithHyperlinks(excerpt: Excerpt, config: Required<MarkdownDocumenterConfiguration>): DocParagraph;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  excerpt | Excerpt |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderFunctionLikeTable {#renderfunctionliketable-Function}

#### Signature

```typescript
export declare function renderFunctionLikeTable(apiItems: readonly ApiFunctionLike[], itemKind: ApiItemKind, config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItems | readonly [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-TypeAlias)<!-- -->\[\] |  |
|  itemKind | ApiItemKind |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeading {#renderheading-Function}

#### Signature

```typescript
export declare function renderHeading(heading: Heading, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  heading | [Heading](./api-markdown-documenter/heading-interface) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeadingForApiItem {#renderheadingforapiitem-Function}

#### Signature

```typescript
export declare function renderHeadingForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeritageTypes {#renderheritagetypes-Function}

#### Signature

```typescript
export declare function renderHeritageTypes(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderMemberTables {#rendermembertables-Function}

#### Signature

```typescript
export declare function renderMemberTables(memberTableProperties: readonly MemberTableProperties[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | readonly MemberTableProperties\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderModifiersCell {#rendermodifierscell-Function}

#### Signature

```typescript
export declare function renderModifiersCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPackagesTable {#renderpackagestable-Function}

#### Signature

```typescript
export declare function renderPackagesTable(apiPackages: readonly ApiPackage[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiPackages | readonly ApiPackage\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParametersSection {#renderparameterssection-Function}

#### Signature

```typescript
export declare function renderParametersSection(apiFunctionLike: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiFunctionLike | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-TypeAlias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParametersTable {#renderparameterstable-Function}

#### Signature

```typescript
export declare function renderParametersTable(apiParameters: readonly Parameter[], config: Required<MarkdownDocumenterConfiguration>): DocTable;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameters | readonly Parameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterSummaryCell {#renderparametersummarycell-Function}

#### Signature

```typescript
export declare function renderParameterSummaryCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterTitleCell {#renderparametertitlecell-Function}

#### Signature

```typescript
export declare function renderParameterTitleCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterTypeCell {#renderparametertypecell-Function}

#### Signature

```typescript
export declare function renderParameterTypeCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPropertiesTable {#renderpropertiestable-Function}

#### Signature

```typescript
export declare function renderPropertiesTable(apiProperties: readonly ApiPropertyItem[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiProperties | readonly ApiPropertyItem\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPropertyTypeCell {#renderpropertytypecell-Function}

#### Signature

```typescript
export declare function renderPropertyTypeCell(apiItem: ApiPropertyItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiPropertyItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderRemarks {#renderremarks-Function}

#### Signature

```typescript
export declare function renderRemarks(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderReturnTypeCell {#renderreturntypecell-Function}

#### Signature

```typescript
export declare function renderReturnTypeCell(apiItem: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-TypeAlias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderSignature {#rendersignature-Function}

#### Signature

```typescript
export declare function renderSignature(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderSummary {#rendersummary-Function}

#### Signature

```typescript
export declare function renderSummary(apiItem: ApiItem): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### renderTable {#rendertable-Function}

#### Signature

```typescript
export declare function renderTable(apiItems: readonly ApiItem[], itemKind: ApiItemKind, config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItems | readonly ApiItem\[\] |  |
|  itemKind | ApiItemKind |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderTableWithHeading {#rendertablewithheading-Function}

#### Signature

```typescript
export declare function renderTableWithHeading(memberTableProperties: MemberTableProperties, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | MemberTableProperties |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderTypeParameters {#rendertypeparameters-Function}

#### Signature

```typescript
export declare function renderTypeParameters(typeParameters: readonly TypeParameter[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  typeParameters | readonly TypeParameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

