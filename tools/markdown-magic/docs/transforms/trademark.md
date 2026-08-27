# `trademark`

Use `trademark` to generate the Microsoft trademark notice from the shared template.

## Options

| Option           | Type    | Default | Description                         |
| ---------------- | ------- | ------- | ----------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Trademark` heading.    |
| `headingLevel`   | integer | `2`     | Heading level from `1` through `6`. |

The transform adjusts headings in the shared template relative to `headingLevel`.

## Example

The following marker generates the trademark notice without its section heading:

```markdown
<!-- markdown-magic:begin {"transform":"trademark","includeHeading":false} -->
<!-- markdown-magic:end -->
```
