The following outlines best-practices, as well as tips and tricks for writing Markdown documentation.

These guidelines are specifically in terms [Github-flavored Markdown](https://github.github.com/gfm/).
They may or may not be appropriate in other Markdown documentation systems.

## Line-breaks along sentence boundaries

Just like code, it is useful to consider Markdown documentation in terms of raw legibility (i.e. in its pre-rendered state), as well as longer term maintenance.
Since Markdown documentation is tracked just like code from git's perspective, it is also useful to consider how changes over time will appear in diffs and pull requests.

Github-flavored Markdown treats adjacent lines (separated by exactly 1 newline) as belonging to the same paragraph when rendered.
Lines separated by 2 or more newlines are rendered as separate paragraphs.

When writing Markdown documentation, we recommend formatting paragraphs by breaking lines along sentence boundaries.
In terms of natural language, this is the most meaningful delimiter to break on.
Additionally, this allows the rendered contents to be displayed as desired, while isolating git-wise changes to only the sentences that are changed.

Note that we explicitly **do not** recommend introducing line breaks within the scope of a sentence.
Most IDEs should support word-wrapping, if you find yourself reading / writing raw contents that overflow your editor's view.

(See this page in its raw form for an example)