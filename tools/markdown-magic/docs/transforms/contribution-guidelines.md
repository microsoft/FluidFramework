# `contribution-guidelines`

Use `contribution-guidelines` to generate the contribution guidelines section from the shared template.

## Options

| Option           | Type    | Default | Description                                    | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Contribution Guidelines` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker generates the template content without its section heading:

```markdown
<!-- markdown-magic:begin {"transform":"contribution-guidelines","includeHeading":false} -->
<!-- markdown-magic:end -->
```
