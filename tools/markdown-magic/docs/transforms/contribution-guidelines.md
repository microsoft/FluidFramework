# `contribution-guidelines`

Use `contribution-guidelines` to generate the contribution guidelines section from the shared template.

## Options

| Option           | Type    | Default | Description                                    | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Contribution Guidelines` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`   | integer | Inferred | Set the context heading level from 1 through 6. | This value overrides the inferred depth. The transform adjusts template headings relative to this value.                                                              |

## Example

The following marker generates the template content without its section heading:

```markdown
<!-- markdown-magic:begin {"transform":"contribution-guidelines","includeHeading":false,"headingLevel":2} -->
<!-- markdown-magic:end -->
```
