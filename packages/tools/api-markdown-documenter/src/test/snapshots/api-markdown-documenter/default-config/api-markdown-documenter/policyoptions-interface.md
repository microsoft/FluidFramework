
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
|  [documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-propertysignature) |  | [DocumentBoundaries](./api-markdown-documenter#documentboundaries-typealias) | See [DocumentBoundaries](./api-markdown-documenter#documentboundaries-typealias)<!-- -->. |
|  [headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-propertysignature) |  | [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-typealias) | See [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-typealias)<!-- -->. |
|  [hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-propertysignature) |  | [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-typealias) | See [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-typealias)<!-- -->. |
|  [includeBreadcrumb](./api-markdown-documenter/policyoptions-interface#includebreadcrumb-propertysignature) |  | boolean | Whether or not to include a navigation breadcrumb at the top of rendered document pages. |
|  [includeTopLevelDocumentHeading](./api-markdown-documenter/policyoptions-interface#includetopleveldocumentheading-propertysignature) |  | boolean | Whether or not to include a top-level heading in rendered document pages. |
|  [uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-propertysignature) |  | [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-typealias) | See [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-typealias)<!-- -->. |

## Property Details

### documentBoundaries {#documentboundaries-propertysignature}

See [DocumentBoundaries](./api-markdown-documenter#documentboundaries-typealias)<!-- -->.

#### Signature

```typescript
documentBoundaries?: DocumentBoundaries;
```

### headingTitlePolicy {#headingtitlepolicy-propertysignature}

See [HeadingTitlePolicy](./api-markdown-documenter#headingtitlepolicy-typealias)<!-- -->.

#### Signature

```typescript
headingTitlePolicy?: HeadingTitlePolicy;
```

### hierarchyBoundaries {#hierarchyboundaries-propertysignature}

See [HierarchyBoundaries](./api-markdown-documenter#hierarchyboundaries-typealias)<!-- -->.

#### Signature

```typescript
hierarchyBoundaries?: HierarchyBoundaries;
```

### includeBreadcrumb {#includebreadcrumb-propertysignature}

Whether or not to include a navigation breadcrumb at the top of rendered document pages.

#### Remarks

Note: `Model` items will never have a breadcrumb rendered, even if this is specfied.

#### Signature

```typescript
includeBreadcrumb?: boolean;
```

### includeTopLevelDocumentHeading {#includetopleveldocumentheading-propertysignature}

Whether or not to include a top-level heading in rendered document pages.

#### Remarks

If you will be rendering the document contents into some other document content that will inject its own root heading, this can be used to omit that heading from what is rendered by this system.

#### Signature

```typescript
includeTopLevelDocumentHeading?: boolean;
```

### uriBaseOverridePolicy {#uribaseoverridepolicy-propertysignature}

See [UriBaseOverridePolicy](./api-markdown-documenter#uribaseoverridepolicy-typealias)<!-- -->.

#### Signature

```typescript
uriBaseOverridePolicy?: UriBaseOverridePolicy;
```
