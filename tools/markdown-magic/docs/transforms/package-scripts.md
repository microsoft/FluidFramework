# `package-scripts`

Use `package-scripts` to generate a GitHub Flavored Markdown table from the package `scripts` object.

Each table row contains a script name and its command. The transform preserves the order in `package.json`.

## Options

| Option            | Type    | Default          | Description                                             |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. |
| `includeHeading`  | boolean | `true`           | Include the `Scripts` heading.                          |
| `headingLevel`    | integer | `2`              | Heading level from `1` through `6`.                     |

## Example

The following marker generates only the script table:

```markdown
<!-- markdown-magic:begin {"transform":"package-scripts","includeHeading":false} -->
<!-- markdown-magic:end -->
```
