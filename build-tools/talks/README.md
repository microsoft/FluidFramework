# Talks and presentations

The files in this folder are talks/presentations about the Fluid build tools that have been presented to the team over
the years. They are included here for both historical reference and because they give some context for some of the more
confusing aspects of build-tools.

## Presentation format

The files in this folder are in the [Marp](https://marp.app/) format, and tools from the Marp ecosystem can be used to transform the Markdown
source into other formats, including PowerPoint decks and standalone interactive web-based presentations.

To convert the presentations, you can use the [Marp CLI](https://www.npmjs.com/package/@marp-team/marp-cli). For
example, to create the default HTML output, you can run:

```shell
pnpx @marp-team/marp-cli@latest 2024-fluid-build.md -o fluid-build.html
```
