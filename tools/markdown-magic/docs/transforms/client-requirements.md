# `client-requirements`

Use `client-requirements` to generate the minimum client requirements section from the shared template.

## Options

| Option           | Type    | Default | Description                                        | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Minimum Client Requirements` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker generates a level-three section because it follows a level-three heading:

```markdown
### Existing section

<!-- markdown-magic:begin {"transform":"client-requirements"} -->
<!-- markdown-magic:end -->
```
