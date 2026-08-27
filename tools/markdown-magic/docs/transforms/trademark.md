# `trademark`

Use `trademark` to generate the Microsoft trademark notice from the shared template.

## Options

| Option           | Type    | Default | Description                      | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Trademark` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |

## Example

The following marker generates the trademark notice without its section heading:

```markdown
<!-- markdown-magic:begin {"transform":"trademark","includeHeading":false} -->
<!-- markdown-magic:end -->
```
