# `dependency-guidelines`

Use `dependency-guidelines` to generate the Fluid Framework dependency guidelines from the shared template.

## Options

| Option           | Type    | Default | Description                                            | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Using Fluid Framework libraries` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker generates a section at the depth inferred from its position:

```markdown
<!-- markdown-magic:begin {"transform":"dependency-guidelines"} -->
<!-- markdown-magic:end -->
```
