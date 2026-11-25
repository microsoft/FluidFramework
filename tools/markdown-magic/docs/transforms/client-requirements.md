# `client-requirements`

Use `client-requirements` to generate the minimum client requirements section from the shared template.

## Options

| Option           | Type    | Default | Description                                        | Notes                                                                                                                                                                                 |
| ---------------- | ------- | ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeHeading` | boolean | `true`  | Include the `Minimum Client Requirements` heading. | When enabled, the transform determines the depth from the marker position and adjusts template headings relative to it. See [Generated headings](../../README.md#generated-headings). |
| `headingLevel`   | integer | Inferred | Set the context heading level from 1 through 6.    | This value overrides the inferred depth. The transform adjusts template headings relative to this value.                                                                  |

## Examples

### Markdown

The following marker generates a level-two section because `headingLevel` overrides the preceding heading:

```markdown
### Existing section

<!-- markdown-magic:begin {"transform":"client-requirements","headingLevel":2} -->
<!-- markdown-magic:end -->
```

### MDX

For an MDX document, use MDX comments:

```mdx
### Existing section

{/* markdown-magic:begin {"transform":"client-requirements","headingLevel":2} */}
{/* markdown-magic:end */}
```
