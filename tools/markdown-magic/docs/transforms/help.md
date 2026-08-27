# `help`

Use `help` to generate links to Fluid Framework support resources from the shared template.

## Options

| Option           | Type    | Default | Description                         |
| ---------------- | ------- | ------- | ----------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Help` heading.         |
| `headingLevel`   | integer | `2`     | Heading level from `1` through `6`. |

The transform adjusts headings in the shared template relative to `headingLevel`.

## Example

The following marker generates the default help section:

```markdown
<!-- markdown-magic:begin {"transform":"help"} -->
<!-- markdown-magic:end -->
```
