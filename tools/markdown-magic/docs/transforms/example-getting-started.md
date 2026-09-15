# `example-getting-started`

Use `example-getting-started` to generate setup instructions for an example application.

The transform reads the package name from `package.json` and uses it in the build command.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `Getting Started` heading.                  | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`    | integer | Inferred         | Set the context heading level from 1 through 6.         | This value overrides the depth inferred from the marker position.                                                                     |
| `usesTinylicious` | boolean | `true`           | Include the Tinylicious setup steps.                    | None.                                                                                                                                    |

## Example

The following marker generates setup instructions without Tinylicious steps:

```markdown
<!-- markdown-magic:begin {"transform":"example-getting-started","usesTinylicious":false} -->
<!-- markdown-magic:end -->
```
