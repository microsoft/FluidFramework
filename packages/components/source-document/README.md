# Introduction
The motivation for this work is to support fast/collaborative WYSIWYG editing of documents that are represented via an extensible programming language.  The top-most document structure is represented via a declarative programming language (such as Markdown).  Embedded within the declarative document are blocks of code that contain:

* References to internal and external components
* Definitions of new/reusable components
* Binding expressions between component inputs and outputs

In this scenario, multiple users may simultaneously edit the document, both via a word-like WYSIWYG user interface, as well as edit the document source via any Fluid-aware plain-text editor.  To support this, the document must be represented as source code using only text segments in a SharedString.  Specifically, the document format can not leverage Markers to encode formatting or other document details, as these will be mangled or lost when the document is edited as plain text.

# Requirements

## Document Language
While not a hard requirement, it is desireable for the document language to be a superset of GitHub Flavored Markdown (GFM).

## Embedded Code Blocks
(Intentionally leaving this open ended)

## Parsing
In order to provide a fast and glitch-free editing experience, the parser must be able to synchronously update the AST in response to each edit event.  This is required to ensure the WYSIWYG editor has the correct context when processing user input.  For example, the editor processes the ENTER key differently depending on whether the cursor is currently inside a paragraph, a list item with content, a list item without content, etc.

The editor must also be able to differentiate between changed and unchanged portions of the AST to minimize impact to the DOM.

## TextDocument
A distributed data structure such as SharedString may only be opened by the component instance that created it.  In order to enable multiple components to access the document, we need to introduce a framework-notion of "TextDocument", similar to what we did with TableDocument.

TextDocument will need to include facilities for one or more attached Parsers to locally annotate segments.

# Design Notes

## Document Language

## Embedded Code Blocks

## Parsing
Our current leaning is toward building a small parser combinator framework.  To interface efficiently with the SharedString, the parser should:

* Read directly from SharedString segments, possibly using a callback like `(startOffset: number) => string`.
* Write the AST as local annotations on SharedString segments, possibly using a callback abstraction.

When the source document changes, Parser.parse() will be invoked with the current start/end offsets of the modified text and update the appropriate range of annotations.