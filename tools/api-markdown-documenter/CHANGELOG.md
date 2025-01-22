# @fluid-tools/api-markdown-documenter

## 0.18.0

-   The default suite structure has been updated as follows:
    -   `Package` and `Namespace` items now generate documents _inside_ of their own folder hierarchy, yielding documents named "index".
    -   `Enum` and `TypeAlias` items now generate their own documents (rather than being rendered as sections under their parent document).

### ⚠ BREAKING CHANGES

The default output format has been updated, as noted above.
Additionally...

#### Simplify the parameters given to `MarkdownRenderer` and `HtmlRenderer` methods.

Combines the separate "config" property bag parameters into a single "options" property bag for simplicity.

##### Example

Before:

```typescript
import { loadModel, MarkdownRenderer } from "@fluid-tools/api-markdown-documenter";

const modelDirectoryPath = "<PATH-TO-YOUR-DIRECTORY-CONTAINING-API-REPORTS>";
const outputDirectoryPath = "<YOUR-OUTPUT-DIRECTORY-PATH>";

// Create the API Model from our API reports
const apiModel = await loadModel({
	modelDirectoryPath,
});

const transformConfig = {
	apiModel,
	uriRoot: "",
};

await MarkdownRenderer.renderApiModel(transformConfig, {}, { outputDirectoryPath });
```

After:

```typescript
import { loadModel, MarkdownRenderer } from "@fluid-tools/api-markdown-documenter";

const modelDirectoryPath = "<PATH-TO-YOUR-DIRECTORY-CONTAINING-API-REPORTS>";
const outputDirectoryPath = "<YOUR-OUTPUT-DIRECTORY-PATH>";

// Create the API Model from our API reports
const apiModel = await loadModel({
	modelDirectoryPath,
});

await MarkdownRenderer.renderApiModel({
	apiModel,
	uriRoot: "",
	outputDirectoryPath,
});
```

#### Update pattern for controlling file-wise hierarchy

Previously, users could control certain aspects of the output documentation suite's file-system hierarchy via the `documentBoundaries` and `hierarchyBoundaries` properties of the transformation configuration.
One particular limitation of this setup was that items yielding folder-wise hierarchy (`hierarchyBoundaries`) could never place their own document _inside_ of their own hierarchy.
This naturally lent itself to a pattern where output would commonly be formatted as:

```
- foo.md
- foo
    - bar.md
    - baz.md
```

This pattern works fine for many site generation systems - a link to `/foo` will end up pointing `foo.md` and a link to `/foo/bar` will end up pointing to `foo/bar.md`.
But some systems (e.g. `Docusaurus`) don't handle this well, and instead prefer setups like the following:

```
- foo
    - index.md
    - bar.md
    - baz.md
```

With the previous configuration options, this pattern was not possible, but now is.
Additionally, this pattern is _more_ commonly accepted, so lack of support for this was a real detriment.

Such patterns can now be produced via the consolidated `hierarchy` property, while still allowing full file-naming flexibility.

##### Related changes

For consistency / discoverability, the `DocumentationSuiteConfiguration.getFileNameForItem` property has also been moved under the new `hierarchy` property (`HierarchyConfiguration`) and renamed to `getDocumentName`.

Additionally, where previously that property controlled both the document _and_ folder naming corresponding to a given API item, folder naming can now be controlled independently via the `getFolderName` property.

##### Example migration

Consider the following configuration:

```typescript
const config = {
    ...
    documentBoundaries: [
        ApiItemKind.Class,
        ApiItemKind.Interface,
        ApiItemKind.Namespace,
    ],
    hierarchyBoundaries: [
        ApiItemKind.Namespace,
    ]
    ...
}
```

With this configuration, `Class`, `Interface`, and `Namespace` API items would yield their own documents (rather than being rendered to a parent item's document), and `Namespace` items would additionally generate folder hierarchy (child items rendered to their own documents would be placed under a sub-directory).

Output for this case might look something like the following:

```
- package.md
- class.md
- interface.md
- namespace.md
- namespace
    - namespace-member-a.md
    - namespace-member-b.md
```

This same behavior can now be configured via the following:

```typescript
const config = {
    ...
    hierarchy: {
        [ApiItemKind.Class]: HierarchyKind.Document,
        [ApiItemKind.Interface]: HierarchyKind.Document,
        [ApiItemKind.Namespace]: {
            kind: HierarchyKind.Folder,
            documentPlacement: FolderDocumentPlacement.Outside,
        },
    }
    ...
}
```

Further, if you would prefer to place the resulting `Namespace` documents _under_ their resulting folder, you could use a configuration like the following:

```typescript
const config = {
    ...
    hierarchy: {
        [ApiItemKind.Class]: HierarchyKind.Document,
        [ApiItemKind.Interface]: HierarchyKind.Document,
        [ApiItemKind.Namespace]: {
            kind: HierarchyKind.Folder,
            documentPlacement: FolderDocumentPlacement.Inside, // <=
        },
        getDocumentName: (apiItem) => {
            switch(apiItem.kind) {
                case ApiItemKind.Namespace:
                    return "index";
                default:
                    ...
            }
        }
    }
    ...
}
```

Output for this updated case might look something like the following:

```
- package.md
- class.md
- interface.md
- namespace
    - index.md
    - namespace-member-a.md
    - namespace-member-b.md
```

#### Type-renames

-   `ApiItemTransformationOptions` -> `ApiItemTransformations`
-   `ConfigurationBase` -> `LoggingConfiguration`
-   `RenderDocumentAsHtmlConfig` -> `RenderDocumentAsHtmlConfiguration`
-   `RenderHtmlConfig` -> `RenderHtmlConfiguration`
-   `ToHtmlConfig` -> `ToHtmlConfiguration`

#### Utility function renames

-   `ApiItemUtilities.getQualifiedApiItemName` -> `ApiItemUtilities.getFileSafeNameForApiItem`

#### Configuration properties made `readonly`

-   `ApiItemTransformations`
-   `ApiItemTransformationConfiguration`
-   `DocumentationSuiteOptions`
-   `FileSystemConfiguration`
-   `HtmlRenderer.RenderHtmlConfig`
-   `LintApiModelConfiguration`
-   `MarkdownRenderer.Renderers`
-   `MarkdownRenderer.RenderContext`
-   `ToHtmlTransformations`

#### Separate input "options" types and system "configuration" types

This library has an inconsistent mix of `Partial` and `Required` types to represent partial user input parameters and "complete" configurations needed by the system to function.

This version of the library attempts to align its APIs with the following conventions:

-   Naming:
    -   "Options": refers to user-provided API parameters, which may be incomplete.
    -   "Configuration": refers to the "complete" sets of parameters needed by system functionality.
-   Typing:
    -   When possible, "configuration" types will be declared with all properties required.
    -   When possible, "options" types will be declared as `Partial<FooConfiguration>`. When not possible, they will be declared as separate types.

##### Affected types

-   `ApiTransformationConfiguration` -> `ApiTransformationOptions` (user input) and `ApiTransformationConfiguration` (derived system configuration).
-   `DocumentationSuiteOptions` -> `DocumentationSuiteConfiguration` (user input is taken as `Partial<DocumentationSuiteConfiguration>`).

#### Updated structure of `ApiTransformationConfiguration` and `ApiItemTransformations`

Updated the structure of `ApiTransformationConfiguration` to contain a `transformations` property of type `ApiItemTransformations`, rather than implementing that interface directly.

Also updates `ApiItemTransformations` methods to be keyed off of `ApiItemKind`, rather than being individually named.

E.g. A call like `config.transformApiMethod(...)` would become `config.transformations["Method"](...)`.

This better aligns with similar transformational API surfaces in this library, like the renderers.

The `createDefaultLayout` property of `ApiItemTransformations` now lives directly in `ApiTransformationConfiguration`, but has been renamed to `defaultSectionLayout`.

## 0.17.3

-   Fixes an issue where directories generated for API items configured to yield directory-wise hierarchy (via the `hierarchyBoundaries` option) would be generated with names that differed from their corresponding document names.
    -   Longer term, it would be nice to make the relationship between directory names and document names less intertwined, but for now there are aspects of the system that rely on the two being the same, and this invariant was being violated.
        So, for now, this is considered a bug fix.

## 0.17.2

-   Fixes an issue with generated Markdown heading ID overrides where ID contents were not being properly escaped.
    E.g., an anchor ID of `_foo_` would generate `{#_foo_}` (which Markdown renderers could interpret as italicized contents) rather than `{#\_foo\_}`.
    This had the effect of some Markdown renderers (in this case, Docusaurus) treating the reference ID as `foo` instead of `_foo_`.

## 0.17.1

-   Updates `TSDoc` node handling to emit a _warning_ in place of an _error_ when an embedded `HTML` tag is encountered.
    Also updates the logged notice to include the tag that was encountered.
-   Fixes a bug where the default transformation for the `API Model` page did not correctly account for the `skipPackage` configuration, and would list packages that were not intended for inclusion in the generated docs suite.

## 0.17.0

-   Updates HTML rendering APIs to operate on `HAST` domain trees from `documentToHtml`, and leverage existing rendering libraries ([hast-util-to-html](https://www.npmjs.com/package/hast-util-to-html) and [hast-util-format](https://www.npmjs.com/package/hast-util-format)) rather than maintaining bespoke rendering code.
    -   Updates existing `HtmlRenderer.renderApiModel` and `HtmlRenderer.renderDocument` APIs to leverage the new flow.
    -   Also adds `HtmlRenderer.renderHtml` function for direct rendering of `HAST` format generated by `documentToHtml`.
-   Fixed a bug where text formatting was not applied correctly in some cases in the `toHtml` transformation.

### ⚠ BREAKING CHANGES

-   Formatting of generated HTML strings changes with this update.
-   Support for embedded HTML contents in TSDoc comments has been removed.
    The TSDoc parser has some half-baked support for preserving HTML tags in its output, despite the TSDoc spec making no claims about supporting embedded HTML.
    But it does so in a structure that is difficult to handle correctly, assuming that the output language can support arbitrary HTML contents, and that it is safe to output the contents raw and unsanitized.
    As a result, this library's support for such contents was similarly half-baked, and difficult to maintain.
    VSCode Intellisense, as a comparison, chooses to completely ignore HTML tags, and simply render the inner contents ignoring any HTML decorators.
    This library has adopted the same policy.
    If you depended on HTML content preservation, this change will break you.

## 0.16.1

-   Promote `toHtml` transformation functions to `@public`.
    Updates the API surface to be more flexible, allowing users to specify only a partial config, or the full transformation context if they have it.

## 0.16.0

-   Added the following new utility function to `ApiItemUtilities`:
    1. `ancestryHasModifierTag`: Checks if the provided API item or ancestor items are tagged with the specified [modifier tag](https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags).

### Beta

-   Adds prototype functionality for "linting" an API Model (i.e., the set of packages whose docs are published as a single "suite").
    Can be invoked by importing `lintApiModel` from `@fluid-tools/api-markdown-documenter/beta`.
    Returns a set of TSDoc-related "errors" discovered while walking the API Model.
    -   The primary goal of this tool is to detect issues that `API-Extractor` cannot validate on a per-package basis when generating API reports.
        For now, this is limited to validating `@link` and `@inheritDoc` tags to ensure that symbolic references are valid within the API Model.

### ⚠ BREAKING CHANGES

-   Updated `loadModel` to take a configuration object, rather than individual parameters.
    -   Also allows default use of the console logger when no logger is explicitly given.

## 0.15.0

-   Added the following new utility functions to `ApiItemUtilities`:
    1. `getCustomBlockComments`: Gets all _custom_ [block comments](https://tsdoc.org/pages/spec/tag_kinds/#block-tags) associated with the provided API item.
        - **Will not** include built-in block comment kinds like `@see`, `@param`, etc.
    2. `getModifierTags`: Gets all [modifier tags](https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags) associated with the provided API item.
        - **Will** include built-in modifier tags like `@sealed`, release tags, etc.
    3. `hasModifierTag`: Checks if the provided API item is tagged with the specified [modifier tag](https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags).

### ⚠ BREAKING CHANGES

-   The following existing APIs were updated to return `readonly` arrays, where they were not previously `readonly`:
    -   `getExampleBlocks`
    -   `getSeeBlocks`
    -   `getThrowsBlocks`

## 0.14.0

-   Allow configuration of "alerts" in child item tables.
    -   Default behavior can be overridden via the the `getAlertsForItem` option.

### ⚠ BREAKING CHANGES

-   Update default policy for `getHeadingTextForItem` to not insert `(BETA)` and `(ALPHA)` postfixes based on release tags.
    If this is the desired behavior, it can be replicated by overriding `getHeadingTextForItem` to do so.

## 0.13.0

### ⚠ BREAKING CHANGES

-   Removed support for generating front-matter.
    Front-matter generation was never properly designed, and did not fit well into the transformation flow as it was implemented.
    If you require front-matter in the documents you generate, you can inject it by rendering the `DocumentNode`s generated by `transformApiModel`.

## 0.12.2

-   Fixed an issue where variable item tables did not include type information in default ApiItem transformations.
-   Add variable and property type information to associated details sections in default ApiItem transformations.
-   Further improved error messages when an unexpected child kind is encountered when iterating over children in default ApiItem transformations.

## 0.12.1

-   Improved error messages when an unexpected child kind is encountered when iterating over children in default ApiItem transformations.

## 0.12.0

-   Added functionality for transforming Documentation Domain trees to [hast](https://github.com/syntax-tree/hast).
    The main entrypoint for this is: `documentToHtml`.
-   Updated the package to emit ESM only.
-   Fixed a bug where [inline tags](https://tsdoc.org/pages/spec/tag_kinds/#inline-tags) (other than `{@link}` and `{@inheritDoc}`, which are handled specially by API-Extractor) were not handled and resulted in errors being logged to the console.
    Such tags are now handled in the following way:
    -   [{@label}](https://tsdoc.org/pages/tags/label/) tags are simply omitted from the output (they are intended as metadata, not documentation content).
    -   Other custom inline tags are emitted as italicized text.
-   Fixed a bug where pre-escaped text contents (including embedded HTML content) would be incorrectly re-escaped.
-   Fixed a bug where type parameter information was only being generated for `interface` and `class` items.
-   Adds "Constraint" and "Default" columns to type parameter tables when any are present among the type parameters.
-   Fixed a bug where getter/setter properties under interface items did not get documentation generated for them.

### ⚠ BREAKING CHANGES

-   The package now outputs ESM only.
    Consumers will have to migrate accordingly.
-   `DocumentationNode` now has a required `isEmpty` property.
    Implementations will need to provide this.
-   Update the signature of `createTypeParametersSection` to always generate a `SectionNode` when called, such that consumers don't have to handle a potentially undefined return value.
    If the consumer wants to omit the section (for example when the list of type parameters is empty), they can make the call conditional on their end.
-   Removed `createDocumentWriter`, and exported `DocumentWriter` is now an interface rather than a class.
    A `DocumentWriter` may be instantiated via `DocumentWriter.create` (or you can use your own implementation, which was not previously supported).
-   Update `typescript` dependency from `4.x` to `5.x`.
