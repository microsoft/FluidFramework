# `api-docs`

Use `api-docs` to generate a link to a package's API documentation.

Use this transform only for a published Fluid Framework package that has API documentation on `fluidframework.com`.

The transform reads the package name from `package.json`. For a scoped package, it removes the scope from the documentation path.

## Options

| Option            | Type    | Default          | Description                                             | Notes                                                                                                                                    |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. | None.                                                                                                                                    |
| `includeHeading`  | boolean | `true`           | Include the `API Documentation` heading.                | When enabled, the transform determines the depth from the marker position. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`    | integer | Inferred         | Set the context heading level from 1 through 6.         | This value overrides the depth inferred from the marker position.                                                                            |

## Example

The following marker generates API documentation without a heading:

```markdown
<!-- markdown-magic:begin {"transform":"api-docs","includeHeading":false} -->
<!-- markdown-magic:end -->
```
