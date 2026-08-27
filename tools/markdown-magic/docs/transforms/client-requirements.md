# `client-requirements`

Use `client-requirements` to generate the minimum client requirements section from the shared template.

## Options

| Option           | Type    | Default | Description                                        |
| ---------------- | ------- | ------- | -------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Minimum Client Requirements` heading. |
| `headingLevel`   | integer | `2`     | Heading level from `1` through `6`.                |

The transform adjusts headings in the shared template relative to `headingLevel`.

## Example

The following marker generates a level-three section:

```markdown
<!-- markdown-magic:begin {"transform":"client-requirements","headingLevel":3} -->
<!-- markdown-magic:end -->
```
