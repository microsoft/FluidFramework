# `include-code`

Use `include-code` to add text from another file to a fenced code block.

## Options

| Option     | Type    | Required | Description                                             |
| ---------- | ------- | -------- | ------------------------------------------------------- |
| `path`     | string  | Yes      | Source path relative to the destination document.       |
| `start`    | integer | No       | Zero-based index of the first source line to include.   |
| `end`      | integer | No       | Zero-based index after the last source line to include. |
| `language` | string  | No       | Language identifier for the code fence.                 |

`start` is inclusive. `end` is exclusive. Negative indexes count from the end of the source file. The transform removes leading and trailing whitespace from the selected text.

If `language` is absent, the transform creates a code fence without a language identifier.

## Example

The following marker includes TypeScript source after the first five lines:

```markdown
<!-- markdown-magic:begin {"transform":"include-code","path":"./example.ts","language":"typescript","start":5} -->
<!-- markdown-magic:end -->
```
