# Templates

This directory contains templates used for content generation.

NOTE: changes to these contents constitute a breaking change, since it will change the contents generated in consumers' documents.

## Formatting

Some of the content logic makes assumptions about the formatting of the template contents in this directory.
Namely, it assumes:

-   Documents do not contain a top-level heading.
    -   Used to allow dynamic generation of top-level headings for embedded sections.
-   Any sub-headings are encoded as level 1 headings (e.g., "# Foo", not "## Foo").
    -   Used to dynamically adjust heading levels to conform to the target documents needs.
