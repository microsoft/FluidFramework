# documentation-domain-to-html

This directory contains transformation for converting `Documentation Domain` nodes to HTML syntax trees using [hast](https://github.com/syntax-tree/hast).
These `hast` trees can then be rendered or further transformed using any of the many compatible utilities in the ecosystem.

The transformation logic is extensible, but provides default implementations for all of the `DocumentationNode` types exported by this package.
