# `installation-instructions`

Use `installation-instructions` to generate an npm installation command for a package.

The transform reads the package name from `package.json`.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `Installation` heading.                     | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |
| `devDependency`   | boolean | `false`          | Add `-D` to the installation command.                   | None.                                                                                                                                    |

## Example

The following marker generates a level-three section for a development dependency because it follows a level-three heading:

```markdown
### Existing section

<!-- markdown-magic:begin {"transform":"installation-instructions","devDependency":true} -->
<!-- markdown-magic:end -->
```
