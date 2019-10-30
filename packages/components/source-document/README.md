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

A candidate language structure might be based around 3 core structures. Let `D` denote a document defined as:
```
Define D ::= M | [name]: D | [=C]
Define C as some minimal expression language.
```
- Markdown `M`. Inert data that governs the structure and content of the document. This could be a standard markdown language extended to support `[name]: D` and `[=C]` as sub-nodes.
- Bindings `[name]: D`. Any structure can be bound to a name and names are scoped. This enables direct addressing of sub-structures within a document. For example
  ```
  [members]:
    * [daniel-l]: Daniel
        [likes]:
          * FRP
          * FluidFramework
        [location]: Redmond
    * [jack-w]: Jack
        [likes]:
          * Calc
        [location]: Cambridge, UK
  ```
  The url `mydoc/members/daniel-l/likes` returns the list `* FRP, * FluidFramework` interpreted as some component. Design note. There is a close connection between titles and name binders, and without care we could introduce alot of noise and duplication. Perhaps give name binders a default rendering semantics to avoid duplicating identical names and titles.
- Expressions `[=C]`. A simple language that allows referencing of bound names and calculation across those names. An expression should evaluate to a document component. For example `[=members.daniel-l.likes.length]` returns `2` when evaluated at the top-level. _Name resolution semantics needs some work here._

### Questions to consider.
- What does any given markdown block "evaluate" to. What is the computational structure of a block when referenced via `[=C]`.
- What does any given document structure render as.
- What does any given structure externally resolve to when addressed via url.

### References, Calculation and Update.
How do we model updates and bidirectional editing? What is the difference between:
```
[x]: 4
[=x+1]
```
where someone edits the text 4, and something like slider that bidirectionally updates from the text and from ui controls. Do we model the latter as the slider 'writing' into the document? Do we have 'variable' components that map to a fluid cell? Is the state of a 'variable' just in-memory, where the initial value is seeded from the document. If we want collaborators to see the slider updates then there needs to be some persistence into the document.

## Embedded Code Blocks

## Parsing
Our current leaning is toward building a small parser combinator framework.  To interface efficiently with the SharedString, the parser should:

* Read directly from SharedString segments, possibly using a callback like `(startOffset: number) => string`.
* Write the AST as local annotations on SharedString segments, possibly using a callback abstraction.

When the source document changes, Parser.parse() will be invoked with the current start/end offsets of the modified text and update the appropriate range of annotations.
