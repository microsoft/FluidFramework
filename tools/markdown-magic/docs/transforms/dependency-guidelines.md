# `dependency-guidelines`

Use `dependency-guidelines` to generate the Fluid Framework dependency guidelines from the shared template.

## Options

| Option           | Type    | Default | Description                                            |
| ---------------- | ------- | ------- | ------------------------------------------------------ |
| `includeHeading` | boolean | `true`  | Include the `Using Fluid Framework libraries` heading. |
| `headingLevel`   | integer | `2`     | Heading level from `1` through `6`.                    |

The transform adjusts headings in the shared template relative to `headingLevel`.

## Example

The following marker generates the default level-two section:

```markdown
<!-- markdown-magic:begin {"transform":"dependency-guidelines"} -->
<!-- markdown-magic:end -->
```
