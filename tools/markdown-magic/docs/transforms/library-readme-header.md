# `library-readme-header`

Use `library-readme-header` to generate the standard sections at the start of a library README.

## Options

| Option                 | Type    | Default                        | Description                                             |
| ---------------------- | ------- | ------------------------------ | ------------------------------------------------------- |
| `packageJsonPath`      | string  | `./package.json`               | Package file path relative to the destination document. |
| `headingLevel`         | integer | Inferred from marker position  | Context heading level for all generated sections.       |
| `packageScopeNotice`   | string  | Detected from the package name | Package kind for the scope notice.                      |
| `dependencyGuidelines` | boolean | Public-package default         | Include dependency guidance.                            |
| `installation`         | boolean | Public-package default         | Include installation instructions.                      |
| `devDependency`        | boolean | `false`                        | Add `-D` to the installation command.                   |
| `importInstructions`   | boolean | `true`                         | Include instructions for supported special exports.     |
| `apiDocs`              | boolean | Public-package default         | Include the API documentation link.                     |

A public package is a non-private package in the `FRAMEWORK` or `EXPERIMENTAL` package kind. Public-package defaults are `true` for public packages and `false` for other packages.

Valid values for `packageScopeNotice` are `FRAMEWORK`, `EXAMPLE`, `EXPERIMENTAL`, `INTERNAL`, `PRIVATE`, and `TOOLS`. `FRAMEWORK` generates no scope notice.

Import instructions appear only when the package exports an `alpha`, `beta`, or `legacy` path.

## Example

The following marker generates a header for an experimental package and installs it as a development dependency:

```markdown
<!-- markdown-magic:begin {"transform":"library-readme-header","packageScopeNotice":"EXPERIMENTAL","devDependency":true,"headingLevel":2} -->
<!-- markdown-magic:end -->
```
