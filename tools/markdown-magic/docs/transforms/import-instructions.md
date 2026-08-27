# `import-instructions`

Use `import-instructions` to generate import guidance for supported special package exports.

The transform reads the package name and `exports` object from `package.json`. It supports `alpha`, `beta`, and `legacy` export paths. It generates no content when none of these paths exist.

## Options

| Option            | Type    | Default          | Description                                             |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. |
| `includeHeading`  | boolean | `true`           | Include the `Importing from this package` heading.      |
| `headingLevel`    | integer | `2`              | Heading level from `1` through `6`.                     |

## Example

The following marker reads exports from the package file next to the destination document:

```markdown
<!-- markdown-magic:begin {"transform":"import-instructions"} -->
<!-- markdown-magic:end -->
```
