# `contribution-guidelines`

Use `contribution-guidelines` to generate the contribution guidelines section from the shared template.

## Options

| Option           | Type    | Default | Description                                    |
| ---------------- | ------- | ------- | ---------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Contribution Guidelines` heading. |
| `headingLevel`   | integer | `2`     | Heading level from `1` through `6`.            |

The transform adjusts headings in the shared template relative to `headingLevel`.

## Example

The following marker generates the template content without its section heading:

```markdown
<!-- markdown-magic:begin {"transform":"contribution-guidelines","includeHeading":false} -->
<!-- markdown-magic:end -->
```
