
# PolicyOptions

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Policy configuration options

## Signature

```typescript
export interface PolicyOptions 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-PropertySignature) |  | [DocumentBoundaries](./api-markdown-documenter#documentboundaries-TypeAlias) | See [DocumentBoundaries](./api-markdown-documenter#documentboundaries-TypeAlias)<!-- -->. |
|  [fileNamePolicy](./api-markdown-documenter/policyoptions-interface#filenamepolicy-PropertySignature) |  | [FileNamePolicy](./api-markdown-documenter#filenamepolicy-TypeAlias) | See [FileNamePolicy](./api-markdown-documenter#filenamepolicy-TypeAlias)<!-- -->. |
|  [headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-PropertySignature) |  | [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-TypeAlias) | See [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-TypeAlias)<!-- -->. |
|  [hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-PropertySignature) |  | [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-TypeAlias) | See [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-TypeAlias)<!-- -->. |
|  [includeBreadcrumb](./api-markdown-documenter/policyoptions-interface#includebreadcrumb-PropertySignature) |  | boolean | Whether or not to include a navigation breadcrumb at the top of rendered document pages. |
|  [includeTopLevelDocumentHeading](./api-markdown-documenter/policyoptions-interface#includetopleveldocumentheading-PropertySignature) |  | boolean | Whether or not to include a top-level heading in rendered document pages. |
|  [linkTextPolicy](./api-markdown-documenter/policyoptions-interface#linktextpolicy-PropertySignature) |  | [LinkTextPolicy](./api-markdown-documenter#linktextpolicy-TypeAlias) | See [LinkTextPolicy](./api-markdown-documenter#linktextpolicy-TypeAlias)<!-- -->. |
|  [uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-PropertySignature) |  | [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-TypeAlias) | See [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-TypeAlias)<!-- -->. |

## Property Details

### documentBoundaries {#documentboundaries-PropertySignature}

See [DocumentBoundaries](./api-markdown-documenter#documentboundaries-TypeAlias)<!-- -->.

#### Signature

```typescript
documentBoundaries?: DocumentBoundaries;
```

### fileNamePolicy {#filenamepolicy-PropertySignature}

See [FileNamePolicy](./api-markdown-documenter#filenamepolicy-TypeAlias)<!-- -->.

#### Signature

```typescript
fileNamePolicy?: FileNamePolicy;
```

### headingTitlePolicy {#headingtitlepolicy-PropertySignature}

See [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-TypeAlias)<!-- -->.

#### Signature

```typescript
headingTitlePolicy?: HeadingTitlePolicy;
```

### hierarchyBoundaries {#hierarchyboundaries-PropertySignature}

See [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-TypeAlias)<!-- -->.

#### Signature

```typescript
hierarchyBoundaries?: HierarchyBoundaries;
```

### includeBreadcrumb {#includebreadcrumb-PropertySignature}

Whether or not to include a navigation breadcrumb at the top of rendered document pages.

#### Remarks

Note: `Model` items will never have a breadcrumb rendered, even if this is specfied.

#### Signature

```typescript
includeBreadcrumb?: boolean;
```

### includeTopLevelDocumentHeading {#includetopleveldocumentheading-PropertySignature}

Whether or not to include a top-level heading in rendered document pages.

#### Remarks

If you will be rendering the document contents into some other document content that will inject its own root heading, this can be used to omit that heading from what is rendered by this system.

#### Signature

```typescript
includeTopLevelDocumentHeading?: boolean;
```

### linkTextPolicy {#linktextpolicy-PropertySignature}

See [LinkTextPolicy](./api-markdown-documenter#linktextpolicy-TypeAlias)<!-- -->.

#### Signature

```typescript
linkTextPolicy?: LinkTextPolicy;
```

### uriBaseOverridePolicy {#uribaseoverridepolicy-PropertySignature}

See [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-TypeAlias)<!-- -->.

#### Signature

```typescript
uriBaseOverridePolicy?: UriBaseOverridePolicy;
```
