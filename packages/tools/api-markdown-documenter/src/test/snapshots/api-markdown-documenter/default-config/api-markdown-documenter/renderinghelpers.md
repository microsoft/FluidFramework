
# RenderingHelpers

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

## Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [ChildSectionProperties](./api-markdown-documenter/renderinghelpers/childsectionproperties) |  |  |
|  [DocExample](./api-markdown-documenter/renderinghelpers/docexample) |  |  |
|  [MemberTableProperties](./api-markdown-documenter/renderinghelpers/membertableproperties) |  |  |

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [renderApiSummaryCell(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderapisummarycell-Function) |  | DocTableCell |  |
|  [renderApiTitleCell(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderapititlecell-Function) |  | DocTableCell |  |
|  [renderBetaWarning(config)](./api-markdown-documenter/renderinghelpers#renderbetawarning-Function) |  | DocNoteBox |  |
|  [renderBreadcrumb(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderbreadcrumb-Function) |  | DocSection |  |
|  [renderChildDetailsSection(childSections, config, renderChild)](./api-markdown-documenter/renderinghelpers#renderchilddetailssection-Function) |  | DocSection \| undefined |  |
|  [renderChildrenUnderHeading(childItems, headingTitle, config, renderChild)](./api-markdown-documenter/renderinghelpers#renderchildrenunderheading-Function) |  | DocSection \| undefined |  |
|  [renderDefaultTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers#renderdefaulttable-Function) |  | DocTable \| undefined |  |
|  [renderDeprecationNotice(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderdeprecationnotice-Function) |  | DocSection \| undefined |  |
|  [renderExample(example, config)](./api-markdown-documenter/renderinghelpers#renderexample-Function) |  | DocSection |  |
|  [renderExamples(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderexamples-Function) |  | DocSection \| undefined |  |
|  [renderExcerptWithHyperlinks(excerpt, config)](./api-markdown-documenter/renderinghelpers#renderexcerptwithhyperlinks-Function) |  | DocParagraph |  |
|  [renderFunctionLikeTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers#renderfunctionliketable-Function) |  | DocTable \| undefined |  |
|  [renderHeading(heading, config)](./api-markdown-documenter/renderinghelpers#renderheading-Function) |  | [DocHeading](./api-markdown-documenter/docheading) |  |
|  [renderHeadingForApiItem(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderheadingforapiitem-Function) |  | [DocHeading](./api-markdown-documenter/docheading) |  |
|  [renderHeritageTypes(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderheritagetypes-Function) |  | DocSection \| undefined |  |
|  [renderMemberTables(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers#rendermembertables-Function) |  | DocSection \| undefined |  |
|  [renderModifiersCell(apiItem, config)](./api-markdown-documenter/renderinghelpers#rendermodifierscell-Function) |  | DocTableCell |  |
|  [renderPackagesTable(apiPackages, config)](./api-markdown-documenter/renderinghelpers#renderpackagestable-Function) |  | DocTable \| undefined |  |
|  [renderParametersSection(apiFunctionLike, config)](./api-markdown-documenter/renderinghelpers#renderparameterssection-Function) |  | DocSection \| undefined |  |
|  [renderParametersTable(apiParameters, config)](./api-markdown-documenter/renderinghelpers#renderparameterstable-Function) |  | DocTable |  |
|  [renderParameterSummaryCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers#renderparametersummarycell-Function) |  | DocTableCell |  |
|  [renderParameterTitleCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers#renderparametertitlecell-Function) |  | DocTableCell |  |
|  [renderParameterTypeCell(apiParameter, config)](./api-markdown-documenter/renderinghelpers#renderparametertypecell-Function) |  | DocTableCell |  |
|  [renderPropertiesTable(apiProperties, config)](./api-markdown-documenter/renderinghelpers#renderpropertiestable-Function) |  | DocTable \| undefined |  |
|  [renderPropertyTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderpropertytypecell-Function) |  | DocTableCell |  |
|  [renderRemarks(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderremarks-Function) |  | DocSection \| undefined |  |
|  [renderReturnTypeCell(apiItem, config)](./api-markdown-documenter/renderinghelpers#renderreturntypecell-Function) |  | DocTableCell |  |
|  [renderSignature(apiItem, config)](./api-markdown-documenter/renderinghelpers#rendersignature-Function) |  | DocSection \| undefined |  |
|  [renderSummary(apiItem)](./api-markdown-documenter/renderinghelpers#rendersummary-Function) |  | DocSection \| undefined |  |
|  [renderTable(apiItems, itemKind, config)](./api-markdown-documenter/renderinghelpers#rendertable-Function) |  | DocTable \| undefined |  |
|  [renderTableWithHeading(memberTableProperties, config)](./api-markdown-documenter/renderinghelpers#rendertablewithheading-Function) |  | DocSection \| undefined |  |
|  [renderTypeParameters(typeParameters, config)](./api-markdown-documenter/renderinghelpers#rendertypeparameters-Function) |  | DocSection \| undefined |  |

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
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderApiTitleCell {#renderapititlecell-Function}

#### Signature

```typescript
export declare function renderApiTitleCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderBetaWarning {#renderbetawarning-Function}

#### Signature

```typescript
export declare function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocNoteBox;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderBreadcrumb {#renderbreadcrumb-Function}

#### Signature

```typescript
export declare function renderBreadcrumb(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderChildDetailsSection {#renderchilddetailssection-Function}

#### Signature

```typescript
export declare function renderChildDetailsSection(childSections: readonly ChildSectionProperties[], config: Required<MarkdownDocumenterConfiguration>, renderChild: (apiItem: any) => DocSection): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  childSections | readonly ChildSectionProperties\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
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
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |
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
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderDeprecationNotice {#renderdeprecationnotice-Function}

#### Signature

```typescript
export declare function renderDeprecationNotice(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderExample {#renderexample-Function}

#### Signature

```typescript
export declare function renderExample(example: DocExample, config: Required<MarkdownDocumenterConfiguration>): DocSection;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  example | DocExample |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderExamples {#renderexamples-Function}

#### Signature

```typescript
export declare function renderExamples(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderExcerptWithHyperlinks {#renderexcerptwithhyperlinks-Function}

#### Signature

```typescript
export declare function renderExcerptWithHyperlinks(excerpt: Excerpt, config: Required<MarkdownDocumenterConfiguration>): DocParagraph;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  excerpt | Excerpt |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

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
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderHeading {#renderheading-Function}

#### Signature

```typescript
export declare function renderHeading(heading: Heading, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  heading | [Heading](./api-markdown-documenter/heading) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderHeadingForApiItem {#renderheadingforapiitem-Function}

#### Signature

```typescript
export declare function renderHeadingForApiItem(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocHeading;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderHeritageTypes {#renderheritagetypes-Function}

#### Signature

```typescript
export declare function renderHeritageTypes(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderMemberTables {#rendermembertables-Function}

#### Signature

```typescript
export declare function renderMemberTables(memberTableProperties: readonly MemberTableProperties[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | readonly MemberTableProperties\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderModifiersCell {#rendermodifierscell-Function}

#### Signature

```typescript
export declare function renderModifiersCell(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderPackagesTable {#renderpackagestable-Function}

#### Signature

```typescript
export declare function renderPackagesTable(apiPackages: readonly ApiPackage[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiPackages | readonly ApiPackage\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderParametersSection {#renderparameterssection-Function}

#### Signature

```typescript
export declare function renderParametersSection(apiFunctionLike: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiFunctionLike | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-TypeAlias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderParametersTable {#renderparameterstable-Function}

#### Signature

```typescript
export declare function renderParametersTable(apiParameters: readonly Parameter[], config: Required<MarkdownDocumenterConfiguration>): DocTable;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameters | readonly Parameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderParameterSummaryCell {#renderparametersummarycell-Function}

#### Signature

```typescript
export declare function renderParameterSummaryCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderParameterTitleCell {#renderparametertitlecell-Function}

#### Signature

```typescript
export declare function renderParameterTitleCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderParameterTypeCell {#renderparametertypecell-Function}

#### Signature

```typescript
export declare function renderParameterTypeCell(apiParameter: Parameter, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiParameter | Parameter |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderPropertiesTable {#renderpropertiestable-Function}

#### Signature

```typescript
export declare function renderPropertiesTable(apiProperties: readonly ApiPropertyItem[], config: Required<MarkdownDocumenterConfiguration>): DocTable | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiProperties | readonly ApiPropertyItem\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderPropertyTypeCell {#renderpropertytypecell-Function}

#### Signature

```typescript
export declare function renderPropertyTypeCell(apiItem: ApiPropertyItem, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiPropertyItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderRemarks {#renderremarks-Function}

#### Signature

```typescript
export declare function renderRemarks(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderReturnTypeCell {#renderreturntypecell-Function}

#### Signature

```typescript
export declare function renderReturnTypeCell(apiItem: ApiFunctionLike, config: Required<MarkdownDocumenterConfiguration>): DocTableCell;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | [ApiFunctionLike](./api-markdown-documenter#apifunctionlike-TypeAlias) |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderSignature {#rendersignature-Function}

#### Signature

```typescript
export declare function renderSignature(apiItem: ApiItem, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

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
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderTableWithHeading {#rendertablewithheading-Function}

#### Signature

```typescript
export declare function renderTableWithHeading(memberTableProperties: MemberTableProperties, config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  memberTableProperties | MemberTableProperties |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

### renderTypeParameters {#rendertypeparameters-Function}

#### Signature

```typescript
export declare function renderTypeParameters(typeParameters: readonly TypeParameter[], config: Required<MarkdownDocumenterConfiguration>): DocSection | undefined;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  typeParameters | readonly TypeParameter\[\] |  |
|  config | Required&lt;[MarkdownDocumenterConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration)<!-- -->&gt; |  |

