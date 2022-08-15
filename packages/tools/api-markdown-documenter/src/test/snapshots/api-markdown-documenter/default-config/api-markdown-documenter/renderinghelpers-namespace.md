
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
|  [renderApiSummaryCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderapisummarycell-function) |  | DocTableCell |  |
|  [renderApiTitleCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderapititlecell-function) |  | DocTableCell |  |
|  [renderBetaWarning(config)](./api-markdown-documenter/renderinghelpers-namespace#renderbetawarning-function) |  | DocNoteBox |  |
|  [renderBreadcrumb(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderbreadcrumb-function) |  | DocSection |  |
|  [renderChildDetailsSection(childSections, config, renderChild)](./api-markdown-documenter/renderinghelpers-namespace#renderchilddetailssection-function) |  | DocSection \| undefined |  |
|  [renderChildrenUnderHeading(childItems, headingTitle, config, renderChild)](./api-markdown-documenter/renderinghelpers-namespace#renderchildrenunderheading-function) |  | DocSection \| undefined |  |
|  [renderDefaultTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#renderdefaulttable-function) |  | DocTable \| undefined |  |
|  [renderDeprecationNotice(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderdeprecationnotice-function) |  | DocSection \| undefined |  |
|  [renderExample(example, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexample-function) |  | DocSection |  |
|  [renderExamples(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexamples-function) |  | DocSection \| undefined |  |
|  [renderExcerptWithHyperlinks(excerpt, config)](./api-markdown-documenter/renderinghelpers-namespace#renderexcerptwithhyperlinks-function) |  | DocParagraph |  |
|  [renderFunctionLikeTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#renderfunctionliketable-function) |  | DocTable \| undefined |  |
|  [renderHeading(heading, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheading-function) |  | [DocHeading](./api-markdown-documenter/docheading-class) |  |
|  [renderHeadingForApiItem(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheadingforapiitem-function) |  | [DocHeading](./api-markdown-documenter/docheading-class) |  |
|  [renderHeritageTypes(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderheritagetypes-function) |  | DocSection \| undefined |  |
|  [renderMemberTables(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#rendermembertables-function) |  | DocSection \| undefined |  |
|  [renderModifiersCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#rendermodifierscell-function) |  | DocTableCell |  |
|  [renderPackagesTable(apiPackages, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpackagestable-function) |  | DocTable \| undefined |  |
|  [renderParametersSection(apiFunctionLike, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparameterssection-function) |  | DocSection \| undefined |  |
|  [renderParametersTable(apiParameters, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparameterstable-function) |  | DocTable |  |
|  [renderParameterSummaryCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametersummarycell-function) |  | DocTableCell |  |
|  [renderParameterTitleCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametertitlecell-function) |  | DocTableCell |  |
|  [renderParameterTypeCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers-namespace#renderparametertypecell-function) |  | DocTableCell |  |
|  [renderPropertiesTable(apiProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpropertiestable-function) |  | DocTable \| undefined |  |
|  [renderPropertyTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderpropertytypecell-function) |  | DocTableCell |  |
|  [renderRemarks(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderremarks-function) |  | DocSection \| undefined |  |
|  [renderReturnTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#renderreturntypecell-function) |  | DocTableCell |  |
|  [renderSignature(apiItem, config)](./api-markdown-documenter/renderinghelpers-namespace#rendersignature-function) |  | DocSection \| undefined |  |
|  [renderSummary(apiItem)](./api-markdown-documenter/renderinghelpers-namespace#rendersummary-function) |  | DocSection \| undefined |  |
|  [renderTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertable-function) |  | DocTable \| undefined |  |
|  [renderTableWithHeading(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertablewithheading-function) |  | DocSection \| undefined |  |
|  [renderTypeParameters(typeParameters, config)](./api-markdown-documenter/renderinghelpers-namespace#rendertypeparameters-function) |  | DocSection \| undefined |  |

## Function Details

### renderApiSummaryCell {#renderapisummarycell-function}

#### Signature

```typescript
export declare function renderApiSummaryCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderApiTitleCell {#renderapititlecell-function}

#### Signature

```typescript
export declare function renderApiTitleCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderBetaWarning {#renderbetawarning-function}

#### Signature

```typescript
export declare function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocNoteBox;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderBreadcrumb {#renderbreadcrumb-function}

#### Signature

```typescript
export declare function renderBreadcrumb(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderChildDetailsSection {#renderchilddetailssection-function}

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

### renderChildrenUnderHeading {#renderchildrenunderheading-function}

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

### renderDefaultTable {#renderdefaulttable-function}

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

### renderDeprecationNotice {#renderdeprecationnotice-function}

#### Signature

```typescript
export declare function renderDeprecationNotice(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExample {#renderexample-function}

#### Signature

```typescript
export declare function renderExample(example: DocExample, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  example | DocExample |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExamples {#renderexamples-function}

#### Signature

```typescript
export declare function renderExamples(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderExcerptWithHyperlinks {#renderexcerptwithhyperlinks-function}

#### Signature

```typescript
export declare function renderExcerptWithHyperlinks(excerpt: Excerpt, config: Required<MarkdownDocumenterConfiguration>): DocParagraph;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  excerpt | Excerpt |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderFunctionLikeTable {#renderfunctionliketable-function}

#### Signature

```typescript
export declare function renderFunctionLikeTable(apiItems: readonly ApiFunctionLike[], itemKind: ApiItemKind, config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItems | readonly [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-typealias)<!-- -->\[\] |  |
|  itemKind | ApiItemKind |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeading {#renderheading-function}

#### Signature

```typescript
export declare function renderHeading(heading: Heading, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  heading | [Heading](./api-markdown-documenter/heading-interface) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeadingForApiItem {#renderheadingforapiitem-function}

#### Signature

```typescript
export declare function renderHeadingForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderHeritageTypes {#renderheritagetypes-function}

#### Signature

```typescript
export declare function renderHeritageTypes(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderMemberTables {#rendermembertables-function}

#### Signature

```typescript
export declare function renderMemberTables(memberTableProperties: readonly MemberTableProperties[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | readonly MemberTableProperties\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderModifiersCell {#rendermodifierscell-function}

#### Signature

```typescript
export declare function renderModifiersCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPackagesTable {#renderpackagestable-function}

#### Signature

```typescript
export declare function renderPackagesTable(apiPackages: readonly ApiPackage[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiPackages | readonly ApiPackage\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParametersSection {#renderparameterssection-function}

#### Signature

```typescript
export declare function renderParametersSection(apiFunctionLike: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiFunctionLike | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-typealias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParametersTable {#renderparameterstable-function}

#### Signature

```typescript
export declare function renderParametersTable(apiParameters: readonly Parameter[], config: Required<MarkdownDocumenterConfiguration>): DocTable;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameters | readonly Parameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterSummaryCell {#renderparametersummarycell-function}

#### Signature

```typescript
export declare function renderParameterSummaryCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterTitleCell {#renderparametertitlecell-function}

#### Signature

```typescript
export declare function renderParameterTitleCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderParameterTypeCell {#renderparametertypecell-function}

#### Signature

```typescript
export declare function renderParameterTypeCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPropertiesTable {#renderpropertiestable-function}

#### Signature

```typescript
export declare function renderPropertiesTable(apiProperties: readonly ApiPropertyItem[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiProperties | readonly ApiPropertyItem\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderPropertyTypeCell {#renderpropertytypecell-function}

#### Signature

```typescript
export declare function renderPropertyTypeCell(apiItem: ApiPropertyItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiPropertyItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderRemarks {#renderremarks-function}

#### Signature

```typescript
export declare function renderRemarks(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderReturnTypeCell {#renderreturntypecell-function}

#### Signature

```typescript
export declare function renderReturnTypeCell(apiItem: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-typealias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderSignature {#rendersignature-function}

#### Signature

```typescript
export declare function renderSignature(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderSummary {#rendersummary-function}

#### Signature

```typescript
export declare function renderSummary(apiItem: ApiItem): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### renderTable {#rendertable-function}

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

### renderTableWithHeading {#rendertablewithheading-function}

#### Signature

```typescript
export declare function renderTableWithHeading(memberTableProperties: MemberTableProperties, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | MemberTableProperties |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

### renderTypeParameters {#rendertypeparameters-function}

#### Signature

```typescript
export declare function renderTypeParameters(typeParameters: readonly TypeParameter[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  typeParameters | readonly TypeParameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration-interface)<!-- -->&gt; |  |

