
# DefaultPolicies

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

```typescript
export declare namespace DefaultPolicies 
```

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [defaultFileNamePolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultfilenamepolicy-function) |  | string | Default [PolicyOptions.fileNamePolicy](./api-markdown-documenter/policyoptions-interface#filenamepolicy-propertysignature)<!-- -->.<!-- -->Uses a cleaned-up version of the item's <code>displayName</code>, except for the following types:<!-- -->- Model: Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root. - Package: uses only the unscoped portion of the package name is used. |
|  [defaultHeadingTitlePolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultheadingtitlepolicy-function) |  | string | Default [PolicyOptions.headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-propertysignature)<!-- -->.<!-- -->Uses the item's <code>displayName</code>, except for <code>Model</code> items, in which case the text "API Overview" is displayed. |
|  [defaultLinkTextPolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultlinktextpolicy-function) |  | string | Default [PolicyOptions.linkTextPolicy](./api-markdown-documenter/policyoptions-interface#linktextpolicy-propertysignature)<!-- -->.<!-- -->Always uses the item's <code>displayName</code>. |
|  [defaultUriBaseOverridePolicy()](./api-markdown-documenter/defaultpolicies-namespace#defaulturibaseoverridepolicy-function) |  | string \| undefined | Default [PolicyOptions.uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-propertysignature)<!-- -->.<!-- -->Always uses default URI base. |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [defaultDocumentBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaultdocumentboundaries-variable) |  | Default [PolicyOptions.documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-propertysignature)<!-- -->.<!-- -->Generates separate documents for the following types:<!-- -->- Model\* - Package\* - Class - Interface - Namespace |
|  [defaultHierarchyBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaulthierarchyboundaries-variable) |  | Default [PolicyOptions.hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-propertysignature)<!-- -->.<!-- -->Creates sub-directories for the following types:<!-- -->- Package\* - Namespace |

## Function Details

### defaultFileNamePolicy {#defaultfilenamepolicy-function}

Default [PolicyOptions.fileNamePolicy](./api-markdown-documenter/policyoptions-interface#filenamepolicy-propertysignature)<!-- -->.

Uses a cleaned-up version of the item's `displayName`<!-- -->, except for the following types:

- Model: Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root. - Package: uses only the unscoped portion of the package name is used.

#### Signature

```typescript
function defaultFileNamePolicy(apiItem: ApiItem): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### defaultHeadingTitlePolicy {#defaultheadingtitlepolicy-function}

Default [PolicyOptions.headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-propertysignature)<!-- -->.

Uses the item's `displayName`<!-- -->, except for `Model` items, in which case the text "API Overview" is displayed.

#### Signature

```typescript
function defaultHeadingTitlePolicy(apiItem: ApiItem): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### defaultLinkTextPolicy {#defaultlinktextpolicy-function}

Default [PolicyOptions.linkTextPolicy](./api-markdown-documenter/policyoptions-interface#linktextpolicy-propertysignature)<!-- -->.

Always uses the item's `displayName`<!-- -->.

#### Signature

```typescript
function defaultLinkTextPolicy(apiItem: ApiItem): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### defaultUriBaseOverridePolicy {#defaulturibaseoverridepolicy-function}

Default [PolicyOptions.uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-propertysignature)<!-- -->.

Always uses default URI base.

#### Signature

```typescript
function defaultUriBaseOverridePolicy(): string | undefined;
```

## Variable Details

### defaultDocumentBoundaries {#defaultdocumentboundaries-variable}

Default [PolicyOptions.documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-propertysignature)<!-- -->.

Generates separate documents for the following types:

- Model\* - Package\* - Class - Interface - Namespace

#### Signature

```typescript
defaultDocumentBoundaries: ApiItemKind[]
```

### defaultHierarchyBoundaries {#defaulthierarchyboundaries-variable}

Default [PolicyOptions.hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-propertysignature)<!-- -->.

Creates sub-directories for the following types:

- Package\* - Namespace

#### Signature

```typescript
defaultHierarchyBoundaries: ApiItemKind[]
```
