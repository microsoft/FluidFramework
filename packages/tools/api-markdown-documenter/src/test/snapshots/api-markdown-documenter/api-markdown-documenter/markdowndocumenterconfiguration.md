
# MarkdownDocumenterConfiguration

[(model)](./index) &gt; [@fluid-tools/api-markdown-documenter](./api-markdown-documenter)

Configuration options for the Markdown documenter.

## Signature

```typescript
export interface MarkdownDocumenterConfiguration extends PolicyOptions, RenderingPolicies 
```
<b>Extends:</b> [PolicyOptions](./api-markdown-documenter/policyoptions)

, [RenderingPolicies](./api-markdown-documenter/renderingpolicies)


## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiModel](./api-markdown-documenter/markdowndocumenterconfiguration#apimodel-PropertySignature) |  | ApiModel | API Model for which the documentation is being generated. This is the output of [API-Extractor](https://api-extractor.com/)<!-- -->. |
|  [newlineKind](./api-markdown-documenter/markdowndocumenterconfiguration#newlinekind-PropertySignature) |  | NewlineKind | Specifies what type of newlines API Documenter should use when writing output files. By default, the output files will be written with Windows-style newlines. |
|  [tsdocConfiguration](./api-markdown-documenter/markdowndocumenterconfiguration#tsdocconfiguration-PropertySignature) |  | TSDocConfiguration | TSDoc Configuration to use when parsing source-code documentation. If not provided, a default configuration will be used. |
|  [uriRoot](./api-markdown-documenter/markdowndocumenterconfiguration#uriroot-PropertySignature) |  | string | Default root uri used when generating content links. |
|  [verbose](./api-markdown-documenter/markdowndocumenterconfiguration#verbose-PropertySignature) |  | boolean | Whether or not verbose logging is enabled. |

## Property Details

### apiModel {#apimodel-PropertySignature}

API Model for which the documentation is being generated. This is the output of [API-Extractor](https://api-extractor.com/)<!-- -->.

#### Remarks

Beyond being the root entry for rendering, this is used to resolve member links globally, etc.

#### Signature

```typescript
apiModel: ApiModel;
```

### newlineKind {#newlinekind-PropertySignature}

Specifies what type of newlines API Documenter should use when writing output files. By default, the output files will be written with Windows-style newlines.

#### Signature

```typescript
readonly newlineKind?: NewlineKind;
```

### tsdocConfiguration {#tsdocconfiguration-PropertySignature}

TSDoc Configuration to use when parsing source-code documentation. If not provided, a default configuration will be used.

#### Signature

```typescript
readonly tsdocConfiguration?: TSDocConfiguration;
```

### uriRoot {#uriroot-PropertySignature}

Default root uri used when generating content links.

#### Signature

```typescript
readonly uriRoot: string;
```

### verbose {#verbose-PropertySignature}

Whether or not verbose logging is enabled.

#### Signature

```typescript
readonly verbose?: boolean;
```
