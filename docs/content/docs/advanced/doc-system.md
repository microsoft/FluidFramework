---
sidebarDepth: 3
---

# Using the documentation system effectively

The Fluid docs are built using [VuePress](https://vuepress.vuejs.org/). It contains many of the features one would
expect from a modern documentation system. Content is written in Markdown.

VuePress is extensible in several ways through plugins both to itself, and to
[markdown-it](https://github.com/markdown-it/markdown-it), the markdown engine used. This provides two nice ecosystems
to draw from, plus established ways to extend it for our needs. It is written in JavaScript so any Fluid contributor
should be feel comfortable extending the docs system if needed.

---

**Contents:**

{{< table_of_contents >}}

---

## Building documentation locally

### Generating API documentation

To build the API documentation, do the following from the root of the repository:

```bash
npm install
npm run build
npm run build:docs
npm run build:gendocs
```

The `build:docs` script will generate a JSON representation of all the TSDoc comments, and then `build:gendocs` will
convert that to a tree of markdown files, under `docs/api/`. These files should _not_ be committed to git.

You may run the `build` and `build:docs` scripts from a particular package directory, but `build:gendocs` can only be
run from the root.

### Building documentation site with Vuepress

To build the docs themselves, you'll need to switch to the `docs/` folder, install the dependencies, and then build the
site.

```bash
cd docs
npm install
npm start
```

`npm start` will serve the local documentation from <http://localhost:8080/>.

## Documentation sources

The Fluid documentation comes from three different sources.

Narrative documentation
: The overall structure of the documentation comes from Markdown files in the `docs/` folder.

Automated API documentation
: The contents of the [API](../api/) section is built from [TSDoc
comments](https://api-extractor.com/pages/tsdoc/doc_comment_syntax/) in the source code.

Readmes and other repo files
: Some content may be included from outside the docs folder. See [Including files outside the docs
folder](#including-files-outside-the-docs-folder) for more information.

## Features

### Including other files

#### Reusable snippets

If you want to re-use a snippet in multiple places, place the snippet file in `docs/.vuepress/includes/`. You can then reference
it in a Markdown file like so:

```golang
{{</* include file="_includes/node-versions.md" */>}}
```


### Syntax formatting and line highlighting

Code blocks can specify a language to enable syntax highlighting of the block. You can also highlight specific lines in
the code block.

**Input**

````markdown
```ts {linenos=inline,hl_lines={2-6 9}}
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

```ts {linenos=inline,hl_lines={2-6 9}}
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

This is a _dangerous_ warning

{{< /callout >}}


#### Custom titles

By default, each box's heading is the type. You can change this by providing a title after the type.

**Input**

```markdown
{{%/* callout note "A note about syntax" */%}}

Markdown formatting _goes_ **here.**

{{%/* /callout */%}}
```

**Output**

{{% callout note "A note about syntax" %}}

Markdown formatting _goes_ **here.**

{{% /callout %}}


### Diagrams with Mermaid

[Mermaid examples and syntax reference](https://mermaid-js.github.io/mermaid/)

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

### Markdown enhancements

#### Typography

Ellipsis: ... `...`

Em dash: --- `---`

En dash: -- `--`

Plus/minus: +- `+-`

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
