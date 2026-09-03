# `include`

Use `include` to parse content from another Markdown or MDX file and add its syntax-tree nodes to the destination document.

## Options

| Option  | Type    | Required | Description                                             |
| ------- | ------- | -------- | ------------------------------------------------------- |
| `path`  | string  | Yes      | Source path relative to the destination document.       |
| `start` | integer | No       | Zero-based index of the first source line to include.   |
| `end`   | integer | No       | Zero-based index after the last source line to include. |

`start` is inclusive.
`end` is exclusive.
Negative indexes use JavaScript array-slice rules and count backward from the end of the source.
A terminal line ending creates an empty final entry and affects negative indexes.
The transform removes leading and trailing whitespace from the selected content.

The transform preserves link destinations from the source content. It does not rewrite relative links for the destination document.
The transform resolves reference-style links and images to inline Markdown when their definitions are in the source document. The definitions do not need to be in the selected line range or the destination document.

The source file extension selects the Markdown or MDX parser.
Markdown content can be included in an MDX document.
When the Markdown source contains HTML comments, the transform converts them to MDX comments.
Other HTML nodes are unchanged and must be valid in the MDX destination.

MDX content can be included in a Markdown document only when the generated syntax tree contains no MDX-specific nodes.

## Example

The following marker includes lines 3 through 8 from `overview.md`:

```markdown
<!-- markdown-magic:begin {"transform":"include","path":"./overview.md","start":2,"end":8} -->
<!-- markdown-magic:end -->
```

The following marker includes the third-to-last and second-to-last lines from a source that does not end with a line ending:

```markdown
<!-- markdown-magic:begin {"transform":"include","path":"./overview.md","start":-3,"end":-1} -->
<!-- markdown-magic:end -->
```

The following MDX marker includes all content from `overview.md`:

```mdx
{/* markdown-magic:begin {"transform":"include","path":"./overview.md"} */}
{/* markdown-magic:end */}
```
