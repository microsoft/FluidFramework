# `import-instructions`

Use `import-instructions` to generate import guidance for supported special package exports.

The transform reads the package name and `exports` object from `package.json`. It supports `alpha`, `beta`, and `legacy` export paths. It generates no content when none of these paths exist.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `Importing from this package` heading.      | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker reads exports from the package file next to the destination document:

```markdown
<!-- markdown-magic:begin {"transform":"import-instructions"} -->
<!-- markdown-magic:end -->
```
