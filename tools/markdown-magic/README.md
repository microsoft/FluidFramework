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

**Default**: "**/*.md"

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

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

### Transforms

The following is a list of supported transform pragmas that can be included in your Markdown documentation to automatically generate / embed contents.

#### `INCLUDE`

Can be used to embed contents from another file into the Markdown file.

TODO: arguments and example

#### `LIBRARY_PACKAGE_README`

TODO

#### `EXAMPLE_PACKAGE_README`

TODO

#### `README_EXAMPLE_GETTING_STARTED_SECTION`

TODO

#### `API_DOCS_LINK_SECTION`

TODO

#### `README_INSTALLATION_SECTION`

TODO

#### `README_TRADEMARK_SECTION`

TODO

#### `README_CONTRIBUTION_GUIDELINES_SECTION`

TODO

#### `README_HELP_SECTION`

TODO

#### `PACKAGE_SCRIPTS`

TODO

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README?
Check out our [GitHub Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).
Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
