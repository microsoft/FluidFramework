# `example-app-readme-header`

Use `example-app-readme-header` to generate the standard section at the start of an example application README.

## Options

| Option            | Type    | Default          | Description                                             |
| ----------------- | ------- | ---------------- | ------------------------------------------------------- |
| `packageJsonPath` | string  | `./package.json` | Package file path relative to the destination document. |
| `headingLevel`    | integer | Inferred         | Context heading level for all generated sections.       |
| `gettingStarted`  | boolean | `true`           | Include the getting-started section.                    |
| `usesTinylicious` | boolean | `true`           | Include the Tinylicious setup steps.                    |

If `gettingStarted` is `false`, the transform generates no content. `usesTinylicious` has no effect when `gettingStarted` is `false`.

## Example

The following marker generates setup instructions without Tinylicious steps:

```markdown
<!-- markdown-magic:begin {"transform":"example-app-readme-header","usesTinylicious":false,"headingLevel":2} -->
<!-- markdown-magic:end -->
```
