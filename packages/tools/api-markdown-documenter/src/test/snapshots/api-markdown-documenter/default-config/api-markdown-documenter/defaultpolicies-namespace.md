
# DefaultPolicies

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

```typescript
export declare namespace DefaultPolicies 
```

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [defaultFileNamePolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultfilenamepolicy-Function) |  | string | Default [PolicyOptions.fileNamePolicy](./api-markdown-documenter/policyoptions-interface#filenamepolicy-PropertySignature)<!-- -->.<!-- -->Uses a cleaned-up version of the item's <code>displayName</code>, except for the following types:<!-- -->- Model: Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root. - Package: uses only the unscoped portion of the package name is used. |
|  [defaultHeadingTitlePolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultheadingtitlepolicy-Function) |  | string | Default [PolicyOptions.headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-PropertySignature)<!-- -->.<!-- -->Uses the item's <code>displayName</code>, except for <code>Model</code> items, in which case the text "API Overview" is displayed. |
|  [defaultLinkTextPolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultlinktextpolicy-Function) |  | string | Default [PolicyOptions.linkTextPolicy](./api-markdown-documenter/policyoptions-interface#linktextpolicy-PropertySignature)<!-- -->.<!-- -->Always uses the item's <code>displayName</code>. |
|  [defaultUriBaseOverridePolicy()](./api-markdown-documenter/defaultpolicies-namespace#defaulturibaseoverridepolicy-Function) |  | string \| undefined | Default [PolicyOptions.uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-PropertySignature)<!-- -->.<!-- -->Always uses default URI base. |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [defaultDocumentBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaultdocumentboundaries-Variable) |  | Default [PolicyOptions.documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-PropertySignature)<!-- -->.<!-- -->Generates separate documents for the following types:<!-- -->- Model\* - Package\* - Class - Interface - Namespace |
|  [defaultHierarchyBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaulthierarchyboundaries-Variable) |  | Default [PolicyOptions.hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-PropertySignature)<!-- -->.<!-- -->Creates sub-directories for the following types:<!-- -->- Package\* - Namespace |

## Function Details

### defaultFileNamePolicy {#defaultfilenamepolicy-Function}

Default [PolicyOptions.fileNamePolicy](./api-markdown-documenter/policyoptions-interface#filenamepolicy-PropertySignature)<!-- -->.

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

### defaultHeadingTitlePolicy {#defaultheadingtitlepolicy-Function}

Default [PolicyOptions.headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-PropertySignature)<!-- -->.

Uses the item's `displayName`<!-- -->, except for `Model` items, in which case the text "API Overview" is displayed.

#### Signature

```typescript
function defaultHeadingTitlePolicy(apiItem: ApiItem): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### defaultLinkTextPolicy {#defaultlinktextpolicy-Function}

Default [PolicyOptions.linkTextPolicy](./api-markdown-documenter/policyoptions-interface#linktextpolicy-PropertySignature)<!-- -->.

Always uses the item's `displayName`<!-- -->.

#### Signature

```typescript
function defaultLinkTextPolicy(apiItem: ApiItem): string;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  apiItem | ApiItem |  |

### defaultUriBaseOverridePolicy {#defaulturibaseoverridepolicy-Function}

Default [PolicyOptions.uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-PropertySignature)<!-- -->.

Always uses default URI base.

#### Signature

```typescript
function defaultUriBaseOverridePolicy(): string | undefined;
```

## Variable Details

### defaultDocumentBoundaries {#defaultdocumentboundaries-Variable}

Default [PolicyOptions.documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-PropertySignature)<!-- -->.

Generates separate documents for the following types:

- Model\* - Package\* - Class - Interface - Namespace

#### Signature

```typescript
defaultDocumentBoundaries: ApiItemKind[]
```

### defaultHierarchyBoundaries {#defaulthierarchyboundaries-Variable}

Default [PolicyOptions.hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-PropertySignature)<!-- -->.

Creates sub-directories for the following types:

- Package\* - Namespace

#### Signature

```typescript
defaultHierarchyBoundaries: ApiItemKind[]
```
