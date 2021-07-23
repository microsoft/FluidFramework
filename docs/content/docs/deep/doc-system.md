---
title: "Using the documentation system effectively"
menuPosition: 20
aliases:
  - "/docs/advanced/doc-system"
---

<!-- markdownlint-disable MD036 -->

The Fluid docs are built using [Hugo](https://gohugo.io/). It contains many of the features one would expect from a
modern documentation system. Content is written in Markdown.

---

**Contents:**

{{< table_of_contents >}}

---

## Building documentation locally

For instructions to build the documentation locally, see the Fluid Framework wiki on GitHub:
<https://github.com/microsoft/FluidFramework/wiki/Building-documentation-locally>.

## Documentation sources

The Fluid documentation comes from multiple sources.

Narrative documentation
: The overall structure of the documentation comes from Markdown files in the `docs/` folder.

Automated API documentation
: The contents of the [API]({{< relref "apis" >}}) section is built from [TSDoc
comments](https://api-extractor.com/pages/tsdoc/doc_comment_syntax/) in the source code.

## Features

### Reusable snippets

If you want to re-use a snippet in multiple places, place the snippet file in `docs/_includes/`. You can then reference
it in a Markdown file like so:

```golang
{{%/* include file="docs/_includes/node-versions.md" */%}}
```


### Syntax formatting and line highlighting

Code blocks can specify a language to enable syntax highlighting of the block. You can also highlight specific lines in
the code block.

**Input**

````markdown
```ts {linenos=inline,hl_lines=["2-6",9]}
const numericInput = (keyString: string, coord: string) => {
  let valueToSet = Number(keyString);
  valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
  if (valueToSet >= 10 || valueToSet < 0) {
    return;
  }

  if (coord !== undefined) {
    const cellInputElement = getCellInputElement(coord);
    cellInputElement.value = keyString;

    const toSet = props.puzzle.get<SudokuCell>(coord);
    if (toSet.fixed) {
      return;
    }
    toSet.value = valueToSet;
    toSet.isCorrect = valueToSet === toSet.correctValue;
    props.puzzle.set(coord, toSet);
  }
};
```
````

**Output**

```ts {linenos=inline,hl_lines=["2-6",9]}
const numericInput = (keyString: string, coord: string) => {
  let valueToSet = Number(keyString);
  valueToSet = Number.isNaN(valueToSet) ? 0 : valueToSet;
  if (valueToSet >= 10 || valueToSet < 0) {
    return;
  }

  if (coord !== undefined) {
    const cellInputElement = getCellInputElement(coord);
    cellInputElement.value = keyString;

    const toSet = props.puzzle.get<SudokuCell>(coord);
    if (toSet.fixed) {
      return;
    }
    toSet.value = valueToSet;
    toSet.isCorrect = valueToSet === toSet.correctValue;
    props.puzzle.set(coord, toSet);
  }
};
```

### Info/tip callouts

It is often useful to draw special attention to some content in the docs, such as a tip about proper usage, a warning
about possible security issues when using an API, etc. This can be done using the following syntax in Markdown files:

```markdown
{{</* callout tip */>}}

This is a tip.

{{</* /callout */>}}
```

Which would render this:

{{< callout tip >}}

This is a tip.

{{< /callout >}}

#### Types

Several different "types" are defined, each with special formatting. `tip` is show above, but `note`, `important`,
`warning`, and `danger` are also supported.

{{< callout note >}}

This is a note.

{{< /callout >}}

{{< callout important >}}

This is important!

{{< /callout >}}

{{< callout warning >}}

This is a warning

{{< /callout >}}

{{< callout danger >}}

This is a *dangerous* warning

{{< /callout >}}


#### Custom titles

By default, each box's heading is the type. You can change this by providing a title after the type.

**Input**

```markdown
{{%/* callout note "A note about syntax" */%}}

Markdown formatting *goes* **here.**

{{%/* /callout */%}}
```

**Output**

{{% callout note "A note about syntax" %}}

Markdown formatting *goes* **here.**

{{% /callout %}}


### Diagrams

We prefer text-based diagrams that are converted to images at build time. You can create inline diagrams with
[Mermaid](https://mermaid-js.github.io/), or you can create ASCII art diagrams that will be converted to PNGs at build
time.

#### Mermaid diagrams

Mermaid diagrams can be put inline in a Markdown file using the `{{</* mermaid */>}}` shortcode.

[Mermaid examples and syntax reference.](https://mermaid-js.github.io/mermaid/)

**Input**

```jsx
{{</* mermaid */>}}
classDiagram
Class01 <|-- VeryLongClass : Cool
Class03 *-- Class04
Class05 o-- Class06
Class07 .. Class08
Class09 --> C2 : Where am I?
Class09 --* C3
Class09 --|> Class07
Class07 : equals()
Class07 : Object[] elementData
Class01 : size()
Class01 : int chimp
Class01 : int gorilla
Class08 <--> C2: Cool label
{{</* /mermaid */>}}
```

**Output**

{{< mermaid >}}
classDiagram
Class01 <|-- VeryLongClass : Cool
Class03 *-- Class04
Class05 o-- Class06
Class07 .. Class08
Class09 --> C2 : Where am I?
Class09 --* C3
Class09 --|> Class07
Class07 : equals()
Class07 : Object[] elementData
Class01 : size()
Class01 : int chimp
Class01 : int gorilla
Class08 <--> C2: Cool label
{{< /mermaid >}}

#### ASCII art diagrams with ditaa

[ditaa](https://github.com/stathissideris/ditaa) is a tool to convert ASCII art block diagrams to PNGs. Any file
in the `/docs/content` folder with a `.ditaa` file extension will be converted to a PNG file in the same folder at
build time.

[asciiflow](http://asciiflow.com/) is an in-browser editor that makes it easier to create ASCII art block diagrams.

**Input**

```golang
{{% include file="content/docs/deep/images/example.ditaa" safeHTML=true %}}
```

**Output**

![An example ditaa diagram that has been converted to a PNG image](/docs/deep/images/example.png)


[Read more about ditaa here.](https://github.com/stathissideris/ditaa) Note that we are using
[a fork of the original implementation](https://github.com/akavel/ditaa) re-written in Go to remove a Java dependency.

### Markdown enhancements

#### Typography

Ellipsis: ... `...`

Em dash: --- `---`

En dash: -- `--`

#### Definition lists <Badge text="markdown-it plugin" vertical="middle"/>

You can create definition lists using the syntax defined by [PHP Markdown
Extra](https://michelf.ca/projects/php-markdown/extra/#def-list).

**Input**

```markdown
Apple
: Pomaceous fruit of plants of the genus Malus in
the family Rosaceae.

Orange
: The fruit of an evergreen tree of the genus Citrus.
```

**Output**

Apple
: Pomaceous fruit of plants of the genus Malus in
the family Rosaceae.

Orange
: The fruit of an evergreen tree of the genus Citrus.
