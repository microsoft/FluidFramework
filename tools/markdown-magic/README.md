# @fluid-tools/markdown-magic

This library contains tools for generating and embedding documentation contents in [Markdown](https://www.markdownguide.org/) documentation.

<!-- markdown-magic:begin {"transform":"library-readme-header"} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is a library intended for use within the [microsoft/FluidFramework](https://github.com/microsoft/FluidFramework) repository.**
**It is not intended for public use.**
**We make no stability guarantees regarding this library and its APIs.**

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

## Usage

Run `markdown-magic` from the command line:

```shell
npm run markdown-magic -- [--files <glob> ...] [--workingDirectory <directory>]
```

The `--files` option accepts one or more [globby](https://github.com/sindresorhus/globby#readme) patterns. It selects the files to update. The default patterns are `**/*.md` and `**/*.mdx`.

The `--workingDirectory` option sets the directory from which the tool resolves glob patterns and relative paths. The default is the current working directory.

For example, the following command updates Markdown and MDX files in `docs` except for `docs/README.md`:

```shell
npm run markdown-magic -- --files "docs/**/*.{md,mdx}" "!docs/README.md"
```

## Markers

Add a begin marker and an end marker to a Markdown file. The begin marker contains a JSON object. The `transform` property is required. Other properties are transform options.

```markdown
<!-- markdown-magic:begin {"transform":"include","path":"./overview.md"} -->

Generated content appears here.

<!-- markdown-magic:end -->
```

For MDX, use MDX comments. HTML comments are not valid MDX syntax.

```mdx
{/* markdown-magic:begin {"transform":"include","path":"./overview.mdx"} */}

Generated content appears here.

{/* markdown-magic:end */}
```

The tool parses the full document but writes only the content between the markers. It rejects malformed JSON, unknown transforms, unknown options, nested regions, and unmatched markers.

## Transforms

Transform names use kebab case.

| Transform | Purpose | Options |
| --- | --- | --- |
| `include` | Include Markdown or MDX from another file. | `path` (required), `start`, `end` |
| `include-code` | Include a file in a fenced code block. | `path` (required), `start`, `end`, `language` |
| `library-readme-header` | Generate the standard sections at the start of a library README. | `packageJsonPath`, `packageScopeNotice`, `dependencyGuidelines`, `installation`, `devDependency`, `importInstructions`, `apiDocs` |
| `example-app-readme-header` | Generate the standard section at the start of an example app README. | `packageJsonPath`, `gettingStarted`, `usesTinylicious` |
| `readme-footer` | Generate the standard sections at the end of a README. | `packageJsonPath`, `scripts`, `clientRequirements`, `contributionGuidelines`, `help`, `trademark` |
| `example-getting-started` | Generate setup instructions for an example app. | `packageJsonPath`, `usesTinylicious`, `includeHeading`, `headingLevel` |
| `api-docs` | Generate a link to the package API documentation. | `packageJsonPath`, `includeHeading`, `headingLevel` |
| `installation-instructions` | Generate the package installation command. | `packageJsonPath`, `devDependency`, `includeHeading`, `headingLevel` |
| `import-instructions` | Generate instructions for package export paths. | `packageJsonPath`, `includeHeading`, `headingLevel` |
| `package-scripts` | Generate a table of package scripts. | `packageJsonPath`, `includeHeading`, `headingLevel` |
| `package-scope-notice` | Generate a notice for the package scope. | `packageJsonPath`, `scopeKind` |
| `client-requirements` | Generate the minimum client requirements section. | `includeHeading`, `headingLevel` |
| `contribution-guidelines` | Generate the contribution guidelines section. | `includeHeading`, `headingLevel` |
| `dependency-guidelines` | Generate the dependency guidelines section. | `includeHeading`, `headingLevel` |
| `help` | Generate the help section. | `includeHeading`, `headingLevel` |
| `trademark` | Generate the trademark section. | `includeHeading`, `headingLevel` |

Relative paths use the destination document's directory. Line indexes for `start` and `end` use JavaScript array-slice rules. `start` is inclusive, and `end` is exclusive. Negative indexes count from the end of the file.

For section transforms, `includeHeading` defaults to `true`, and `headingLevel` defaults to `2`. The valid heading levels are 1 through 6. `packageJsonPath` defaults to `./package.json`.

The valid `scopeKind` values are `FRAMEWORK`, `EXAMPLE`, `EXPERIMENTAL`, `INTERNAL`, `PRIVATE`, and `TOOLS`.

An `include` transform can include MDX only when the destination file is also MDX. This rule prevents the tool from writing MDX syntax into a Markdown file.

<!-- markdown-magic:begin {"transform":"readme-footer"} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

* Participate in Q\&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
* [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
* Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact <opencode@microsoft.com> with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README?
Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for?
Please [file an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

<!-- Links -->

[tinylicious]: https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious/
[api-extractor]: https://api-extractor.com/
