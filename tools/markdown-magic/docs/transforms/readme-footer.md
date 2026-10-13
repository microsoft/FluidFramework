# `readme-footer`

Use `readme-footer` to generate standard sections at the end of a package README.

## Options

| Option                   | Type    | Default                | Description                                             |
| ------------------------ | ------- | ---------------------- | ------------------------------------------------------- |
| `packageJsonPath`        | string  | `./package.json`       | Package file path relative to the destination document. |
| `headingLevel`           | integer | Inferred               | Context heading level for all generated sections.       |
| `clientRequirements`     | boolean | Public-package default | Include minimum client requirements.                    |
| `contributionGuidelines` | boolean | `true`                 | Include contribution guidance.                          |
| `help`                   | boolean | `true`                 | Include links to support resources.                     |
| `trademark`              | boolean | `true`                 | Include the trademark notice.                           |

A public package is a non-private package in the `FRAMEWORK` or `EXPERIMENTAL` package kind. The `clientRequirements` default is `true` for public packages and `false` for other packages.

## Example

The following marker adds the standard footer:

```markdown
<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->
<!-- markdown-magic:end -->
```
