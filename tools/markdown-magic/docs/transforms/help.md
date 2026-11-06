# `help`

Use `help` to generate links to Fluid Framework support resources from the shared template.

## Options

| Option           | Type    | Default | Description                 | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Help` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`   | integer | Inferred | Set the context heading level from 1 through 6. | This value overrides the inferred depth. The transform adjusts template headings relative to this value.                                                        |

## Examples

### Markdown

The following marker generates a level-two help section:

```markdown
<!-- markdown-magic:begin {"transform":"help","headingLevel":2} -->
<!-- markdown-magic:end -->
```

### MDX

For an MDX document, use MDX comments:

```mdx
{/* markdown-magic:begin {"transform":"help","headingLevel":2} */}
{/* markdown-magic:end */}
```
