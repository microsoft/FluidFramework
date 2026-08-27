# `example-getting-started`

Use `example-getting-started` to generate setup instructions for an example application.

The transform reads the package name from `package.json` and uses it in the build command.

## Options

| Option            | Type    | Default          | Description                                             |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. |
| `includeHeading`  | boolean | `true`           | Include the `Getting Started` heading.                  |
| `headingLevel`    | integer | `2`              | Heading level from `1` through `6`.                     |
| `usesTinylicious` | boolean | `true`           | Include the Tinylicious setup steps.                    |

## Example

The following marker generates setup instructions without Tinylicious steps:

```markdown
<!-- markdown-magic:begin {"transform":"example-getting-started","usesTinylicious":false} -->
<!-- markdown-magic:end -->
```
