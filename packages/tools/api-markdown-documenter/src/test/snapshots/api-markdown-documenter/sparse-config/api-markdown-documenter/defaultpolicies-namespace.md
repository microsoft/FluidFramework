
# DefaultPolicies

## Signature

```typescript
export declare namespace DefaultPolicies 
```

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [defaultFileNamePolicy(apiItem)](docs/api-markdown-documenter/defaultpolicies-defaultfilenamepolicy-function) |  | string | Default [PolicyOptions.fileNamePolicy](docs/api-markdown-documenter/policyoptions-filenamepolicy-propertysignature)<!-- -->.<!-- -->Uses a cleaned-up version of the item's <code>displayName</code>, except for the following types:<!-- -->- Model: Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root. - Package: uses only the unscoped portion of the package name is used. |
|  [defaultHeadingTitlePolicy(apiItem)](docs/api-markdown-documenter/defaultpolicies-defaultheadingtitlepolicy-function) |  | string | Default [PolicyOptions.headingTitlePolicy](docs/api-markdown-documenter/policyoptions-headingtitlepolicy-propertysignature)<!-- -->.<!-- -->Uses the item's <code>displayName</code>, except for <code>Model</code> items, in which case the text "API Overview" is displayed. |
|  [defaultLinkTextPolicy(apiItem)](docs/api-markdown-documenter/defaultpolicies-defaultlinktextpolicy-function) |  | string | Default [PolicyOptions.linkTextPolicy](docs/api-markdown-documenter/policyoptions-linktextpolicy-propertysignature)<!-- -->.<!-- -->Always uses the item's <code>displayName</code>. |
|  [defaultUriBaseOverridePolicy()](docs/api-markdown-documenter/defaultpolicies-defaulturibaseoverridepolicy-function) |  | string \| undefined | Default [PolicyOptions.uriBaseOverridePolicy](docs/api-markdown-documenter/policyoptions-uribaseoverridepolicy-propertysignature)<!-- -->.<!-- -->Always uses default URI base. |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [defaultDocumentBoundaries](docs/api-markdown-documenter/defaultpolicies-defaultdocumentboundaries-variable) |  | Default [PolicyOptions.documentBoundaries](docs/api-markdown-documenter/policyoptions-documentboundaries-propertysignature)<!-- -->.<!-- -->Generates separate documents for the following types:<!-- -->- Model\* - Package\* - Class - Interface - Namespace |
|  [defaultHierarchyBoundaries](docs/api-markdown-documenter/defaultpolicies-defaulthierarchyboundaries-variable) |  | Default [PolicyOptions.hierarchyBoundaries](docs/api-markdown-documenter/policyoptions-hierarchyboundaries-propertysignature)<!-- -->.<!-- -->Creates sub-directories for the following types:<!-- -->- Package\* - Namespace |

