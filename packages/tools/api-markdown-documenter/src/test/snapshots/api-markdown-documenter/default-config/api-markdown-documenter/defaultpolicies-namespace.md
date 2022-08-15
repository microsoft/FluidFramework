
# DefaultPolicies

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

## Signature

```typescript
export declare namespace DefaultPolicies 
```

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [defaultHeadingTitlePolicy(apiItem)](./api-markdown-documenter/defaultpolicies-namespace#defaultheadingtitlepolicy-function) |  | string | Default [PolicyOptions.headingTitlePolicy](./api-markdown-documenter/policyoptions-interface#headingtitlepolicy-propertysignature)<!-- -->.<!-- -->Uses the item's <code>displayName</code>, except for <code>Model</code> items, in which case the text "API Overview" is displayed. |
|  [defaultUriBaseOverridePolicy()](./api-markdown-documenter/defaultpolicies-namespace#defaulturibaseoverridepolicy-function) |  | string \| undefined | Default [PolicyOptions.uriBaseOverridePolicy](./api-markdown-documenter/policyoptions-interface#uribaseoverridepolicy-propertysignature)<!-- -->.<!-- -->Always uses default URI base. |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [defaultDocumentBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaultdocumentboundaries-variable) |  | Default [PolicyOptions.documentBoundaries](./api-markdown-documenter/policyoptions-interface#documentboundaries-propertysignature)<!-- -->.<!-- -->Generates separate documents for the following types:<!-- -->- Model\* - Package\* - Class - Interface - Namespace |
|  [defaultHierarchyBoundaries](./api-markdown-documenter/defaultpolicies-namespace#defaulthierarchyboundaries-variable) |  | Default [PolicyOptions.hierarchyBoundaries](./api-markdown-documenter/policyoptions-interface#hierarchyboundaries-propertysignature)<!-- -->.<!-- -->Creates sub-directories for the following types:<!-- -->- Package\* - Namespace |

## Function Details

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
