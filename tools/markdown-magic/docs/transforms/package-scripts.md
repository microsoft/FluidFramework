# `package-scripts`

Use `package-scripts` to generate a GitHub Flavored Markdown table from the package `scripts` object.

Each table row contains a script name and its command. The transform preserves the order in `package.json`.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `Scripts` heading.                          | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker generates only the script table:

```markdown
<!-- markdown-magic:begin {"transform":"package-scripts","includeHeading":false} -->
<!-- markdown-magic:end -->
```
