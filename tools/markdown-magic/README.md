# @fluid-tools/markdown-magic

This library contains tools for generating and embedding documentation contents in [Markdown](https://www.markdownguide.org/) documentation.

Note: this package is currently private, and only intended for use in this repository.

## Usage

### Script

To run the `markdown-magic` script against your Markdown files, run the following from the command line:

```shell
npm run markdown-magic [--files <one or more file globs, space-separated>] [--workingDirectory <directory in which to run the script>]
```

#### Arguments

##### `files`

Accepts one or more glob values to match against.
Only file names matching the pattern(s) will have their contents parsed and updated.

Uses the [globby](https://github.com/sindresorhus/globby#readme) format.

**Default**: `**/*.md`

###### Example

```shell
npm run markdown-magic --files \"docs/*\" \"!docs/README.md\"
```

Will run on all Markdown contents under the `docs` directory, except for `!docs/README.md`.

##### `workingDirectory`

Specifies the directory from which the script will be run.
Useful when the directory from which the Node.js process is run is not the hierarchical root from which you wish to run documentation generation.

Default: `Node.js`'s working directory (i.e. the directory from which the script was executed).

###### Example

```shell
npm run markdown-magic --workingDirectory ../../
```

Will run the script from two levels higher in the file structure relative to where the `npm` script itself was executed.

### Transforms

The following is a list of supported transform pragmas that can be included in your Markdown documentation to automatically generate / embed contents.

To include a transform in your document, use the following syntax:

```markdown
<!-- AUTO-GENERATED-CONTENT:START (<transform-name>[:<argument-1>=<value-1>[&<argument-2>=<value-2>...&<argument-N>=<value-N>]]) -->
<!-- AUTO-GENERATED-CONTENT:END -->
```

#### `INCLUDE`

Can be used to embed contents from another file into the Markdown file.

Arguments:

-   `path`: Relative path from the document to the file being embedded.
-   `start`: (optional) First line from the target file to be embedded (inclusive). If positive, the value is relative to the beginning of the file. If negative, the value is relative to the end of the file.
-   `end`: (optional) Limit line from the target file to be embedded (exclusive). If positive, the value is relative to the beginning of the file. If negative, the value is relative to the end of the file.

#### `LIBRARY_PACKAGE_README_HEADER`

Generates simple "header" contents for a library package README.
Contains instructions for installing the package and importing its contents.

Generally recommended for inclusion after a brief package introduction, but before more detailed sections.

Notes:

-   This strictly intended as a starter template to remove the need for some handwritten boilerplate.
    You will still need to fill in semantic and usage information.
-   This is effectively just a wrapper around lower-level templates.
    If you want more fine-grained control over the content structure, we recommend using other templates.
    -   [README_PACKAGE_SCOPE_NOTICE](#readme_package_scope_notice)
    -   [README_INSTALLATION_SECTION](#readme_installation_section)
    -   [README_IMPORT_INSTRUCTIONS](#readme_import_instructions)

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `installation`: Whether or not to include the package "Installation" section.
    -   Default: `true`.
    -   See [README_INSTALLATION_SECTION](#readme_installation_section).
-   `devDependency`: Whether or not the package is intended to be installed as a dev dependency.
    -   Default: `false`.
    -   Only observed if `installation` is `true`.

#### `LIBRARY_PACKAGE_README_FOOTER`

Generates simple "footer" contents for a library package README.

Generally recommended for inclusion at the end of the README.

Notes:

-   This is strictly intended as a starter template to remove the need for some handwritten boilerplate.
    You will still need to fill in semantic and usage information.
-   This is effectively just a wrapper around lower-level templates.
    If you want more fine-grained control over the content structure, we recommend using other templates.
    -   [API_DOCS_LINK_SECTION](#api_docs_link_section)
    -   [README_PACKAGE_SCRIPTS](#readme_package_scripts)
    -   [README_CLIENT_REQUIREMENTS_SECTION](#readme_client_requirements_section)
    -   [README_CONTRIBUTION_GUIDELINES_SECTION](#contribution-guidelines)
    -   [README_HELP_SECTION](#readme_help_section)
    -   [README_TRADEMARK_SECTION](#readme_trademark_section)

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `apiDocs`: Whether or not to include a section pointing to the library's generated API documentation on `fluidframework.com`.
    -   Default: `true`.
    -   Assumes that the package is published, uses [API-Extractor][], and has its documentation published under `fluidframework.com/apis/<package-name>`.
    -   See [API_DOCS_LINK_SECTION](#api_docs_link_section)
-   `scripts`: Whether or not to include a section listing the package's `npm` scripts.
    -   Default: `false`.
    -   See [README_PACKAGE_SCRIPTS](#readme-package_scripts).
-   `clientRequirements`: Whether or not to include a section outlining the minimum client requirements for using Fluid Framework packages.
    -   Default: `true`.
    -   See [README_CLIENT_REQUIREMENTS_SECTION](#readme_client_requirements_section).
-   `contributionGuidelines`: Whether or not to include a section enumerating `fluid-framework`'s contribution guidelines.
    -   Default: `true`.
    -   See [README_CONTRIBUTION_GUIDELINES_SECTION](#readme_contribution_guidelines_section).
-   `help`: Whether or not to include a simple "help" section, which points the reader to various resources.
    -   Default: `true`.
    -   See [README_HELP_SECTION](#readme_help_section).
-   `trademark`: Whether or not to include a section containing our `Microsoft` trademark.
    -   Default: `true`.
    -   See [README_TRADEMARK_SECTION](#readme_trademark_section).

#### `EXAMPLE_PACKAGE_README`

Generates a complete starter `README.md` file for an `Fluid` example app package.

Notes:

-   This strictly intended as a starter template to remove the need for some handwritten boilerplate.
    You will still need to fill in semantic and usage information.
-   This is effectively just a wrapper around lower-level templates.
    If you want more fine-grained control over the content structure, we recommend using other templates.

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `gettingStarted`: Whether or not to include a simple "getting started" usage section.
    -   Default: `true`.
    -   See [README_EXAMPLE_GETTING_STARTED_SECTION](#readme_example_getting_started_section).
-   `usesTinylicious`: Whether or not running the example app requires running [Tinylicious][] from another terminal.
    -   Default: `true`.
    -   Only observed if `gettingStarted` is `true`.
-   `scripts`: Whether or not to include a section listing the package's `npm` scripts.
    -   Default: `false`.
    -   See [README_PACKAGE_SCRIPTS](#readme-package_scripts).
-   `contributionGuidelines`: Whether or not to include a section enumerating `fluid-framework`'s contribution guidelines.
    -   Default: `true`.
    -   See [README_CONTRIBUTION_GUIDELINES_SECTION](#readme_contribution_guidelines_section).
-   `help`: Whether or not to include a simple "help" section, which points the reader to various resources.
    -   Default: `true`.
    -   See [README_HELP_SECTION](#readme_help_section).
-   `trademark`: Whether or not to include a section containing our `Microsoft` trademark.
    -   Default: `true`.
    -   See [README_TRADEMARK_SECTION](#readme_trademark_section).

#### `README_EXAMPLE_GETTING_STARTED_SECTION`

Generates a simple "getting started" usage section for a `Fluid` example app README.

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `usesTinylicious`: Whether or not running the example app requires running [Tinylicious][] from another terminal.
    -   Default: `true`.
-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `API_DOCS_LINK_SECTION`

Generates a README section pointing to the library's generated API documentation on `fluidframework.com`.

Assumes that the package is published, uses [API-Extractor][], and has its documentation published under `fluidframework.com/apis/<package-name>`.

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_INSTALLATION_SECTION`

Generates a README section including package installation instructions.

Assumes that the package is published and can be installed via `npm`.

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_IMPORT_INSTRUCTIONS`

Generates a README section including instructions for how to import from Fluid Framework library packages.
Accounts for our use of package.json exports.
Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_CLIENT_REQUIREMENTS_SECTION`

Generates a section containing minimum client requirements for using Fluid Framework packages.

See the corresponding template [here](./src/templates/Client-Requirements-Template.md).

Arguments:

-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_TRADEMARK_SECTION`

Generates a section containing our `Microsoft` trademark.

See the corresponding template [here](./src/templates/Trademark-Template.md).

Arguments:

-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_CONTRIBUTION_GUIDELINES_SECTION`

Generates a section enumerating `fluid-framework`'s contribution guidelines.

See the corresponding template [here](./src/templates/Contribution-Guidelines-Template.md).

Arguments:

-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_HELP_SECTION`

Generates a simple "help" section, which points the reader to various resources.

See the corresponding template [here](./src/templates/Help-Template.md).

Arguments:

-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_PACKAGE_SCRIPTS`

Generates a section containing a table enumerating the package's `npm` scripts.

Arguments:

-   `packageJsonPath`: Relative file path to the library package's `package.json` file.
    Used for generation of package metadata.
    -   Default: `./package.json`.
-   `includeHeading`: Whether or not to include a section heading above the generated contents.
    -   Default: `true`.
-   `headingLevel`: Root heading level for the generated section.
    Must be a positive integer.
    -   Default: 2.

#### `README_PACKAGE_SCOPE_NOTICE`

Generates a user-facing notice about target audience and support characteristics of the package based on its scope.
By default, it generates the appropriate notice based on the package name's scope (if it's one the system recognizes), but this can be overridden by specifying `scopeKind`.

Arguments:

-   `packageJsonPath`: : Relative file path to the library package's `package.json` file.
    Used to read the package name's scope (when the `scopeKind` argument is not provided).
    -   Default: `./package.json`.
-   `scopeKind`: (optional) Override the automatic scope detection behavior with an explicit scope kind: `EXPERIMENTAL`, `INTERNAL`, or `PRIVATE`.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README_FOOTER:clientRequirements=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->

[tinylicious]: https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious/
[api-extractor]: https://api-extractor.com/
