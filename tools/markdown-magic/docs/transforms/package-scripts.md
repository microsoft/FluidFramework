# `package-scripts`

Use `package-scripts` to generate a GitHub Flavored Markdown table from the package `scripts` object.

Each table row contains the script name, script body, and optional description.
The transform preserves the order in `package.json`.
It leaves the description cell empty when the marker does not specify a description.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `Scripts` heading.                          | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`    | integer | Inferred         | Set the context heading level from 1 through 6.         | This value overrides the depth inferred from the marker position.                                                                        |
| `scriptDescriptions` | record  | `{}`             | Map script names to descriptions.                       | Each value is inline Markdown. Each key must match a script in `package.json`.                                                            |

## Example

The following marker generates only the script table and describes the `test` script:

```markdown
<!-- markdown-magic:begin {
	"transform": "package-scripts",
	"includeHeading": false,
	"scriptDescriptions": {
		"test": "Run all tests."
	}
} -->
<!-- markdown-magic:end -->
```
