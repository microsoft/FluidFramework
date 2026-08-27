# `installation-instructions`

Use `installation-instructions` to generate an npm installation command for a package.

The transform reads the package name from `package.json`.

## Options

| Option            | Type    | Default          | Description                                             |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. |
| `includeHeading`  | boolean | `true`           | Include the `Installation` heading.                     |
| `headingLevel`    | integer | `2`              | Heading level from `1` through `6`.                     |
| `devDependency`   | boolean | `false`          | Add `-D` to the installation command.                   |

## Example

The following marker generates a level-three section for a development dependency:

```markdown
<!-- markdown-magic:begin {"transform":"installation-instructions","headingLevel":3,"devDependency":true} -->
<!-- markdown-magic:end -->
```
