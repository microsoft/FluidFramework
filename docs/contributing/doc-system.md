---
sidebar: auto
---

# Using the documentation system effectively

The Fluid docs are built using [VuePress](https://vuepress.vuejs.org/). It contains many of the features one would
expect from a modern documentation system. Content is written in Markdown.

VuePress is extensible in several ways through plugins both to itself, and to
[markdown-it](https://github.com/markdown-it/markdown-it), the markdown engine used. This provides two nice ecosystems
to draw from, plus established ways to extend it for our needs. It is written in JavaScript so any Fluid contributor
should be feel comfortable extending the docs system if needed.

## Documentation sources

The Fluid documentation comes from three different sources.

Narrative documentation
:   The overall structure of the documentation comes from Markdown files in the `docs/` folder.

Automated API documentation
:   The contents of the [API](../api/overview.md) section is built from [TSDoc
    comments](https://api-extractor.com/pages/tsdoc/doc_comment_syntax/) in the source code.

Readmes and other repo files
:   Some content may be included from outside the docs folder. See [Including files outside the docs
    folder](#including-files-outside-the-docs-folder) for more information.


## Features

VuePress has a number of [built-in features](https://vuepress.vuejs.org/guide/#features). Some of the most important are
called out below, but consult the VuePress documentation for more details.

Additional features have been added using VuePress and markdown-it plugins.

### Including other files <Badge text="markdown-it plugin" vertical="middle"/>

Plugin: <https://github.com/camelaissani/markdown-it-include>

#### Reusable snippets

If you want to re-use a snippet in multiple places, place the snippet file in `docs/.vuepress/includes/`. You can then reference
it in a Markdown file like so:

`!!!innclude(my-file.md)!!!`

Note: `include` is deliberately misspelled in the examples on this page due to limitations with the documentation build
system. In actual usage, `include` should be spelled correctly.

::: important

Snippets are included _before_ links are processed. This means that relative links to other Markdown files in snippets
will be resolved _relative to the file they are included in_. Thus you should ensure your snippets will only be used at
a single level of the folder hierarchy, or simply avoid relative links in reusable snippets.

:::

#### Including files outside the docs folder

You can include files located anywhere in the repo using the same `!!!include()` syntax. The path to the file in the
repo must be specified relative to `docs/.vuepress/includes`. For example, if you want to include the readme file at
`packages/runtime/sequence/readme.md`, for example, you would specify the include path like so:

```markdown
!!!innclude(../../../packages/runtime/sequence/readme.md)!!!
```

You can create a simple wrapper page within the docs folder, then include a file from the repo within it. See
[docs/contributing/breaking-changes.md](https://github.com/microsoft/FluidFramework/blob/master/docs/contributing/breaking-changes.md)
for an example.

Links are resolved as described above for reusable snippets, so you must be careful when using links in files you also
intend to include within the documentation.


### Syntax formatting and line highlighting <Badge text="VuePress feature" vertical="middle"/>

Code blocks can specify a language to enable syntax highlighting of the block. You can also highlight specific lines in
the code block.

**Input**

```` markdown
```typescript{2-6,9}
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

```typescript{2-6,9}
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


### Info/tip boxes <Badge text="VuePress feature" vertical="middle"/>

It is often useful to draw special attention to some content in the docs, such as a tip about proper usage, a warning
about possible security issues when using an API, etc. This can be done using the following syntax in Markdown files:

```markdown
::: tip

The VuePress documentation calls these "containers."

:::
```

Which would render this:

::: tip

The VuePress documentation calls these "containers."

:::

#### Types

Several different "types" are defined, each with special formatting. `tip` is show above, but `note`, `important`,
`warning`, `danger`, and `details` are also supported.

::: note

This is a note.

:::

::: important

This is important!

:::

::: warning

This is a warning

:::

::: danger

This is a _dangerous_ warning

:::

::: details

This is a collapsable details block. It does not work in IE or Classic Edge.

:::

#### Custom titles

By default, each box's heading is the type in all caps. You can change this by providing a title after the type.

**Input**

```markdown
::: note A note about syntax

Markdown goes here

:::
```

**Output**

::: note A note about syntax

Markdown goes here

:::


### Badges <Badge text="VuePress feature" vertical="middle"/>

Badges can be used to flag content. It is implemented as a Vue component, and accepts the following props:

* text - string
* type - string, optional value: `"tip"|"warning"|"error"`, defaults to `"tip"`
* vertical - string, optional value: `"top"|"middle"`, defaults to `"top"`

The following markup renders the badge next to the section header above:

```jsx
<Badge text="VuePress feature" vertical="middle"/>
```

### Tabbed UI <Badge text="VuePress feature" vertical="middle"/>

Plugin: <https://github.com/pskordilakis/vuepress-plugin-tabs>

**Input**

```` markdown
:::: tabs
::: tab React

```jsx
const rerender = () => {
  // Get our dice value stored in the root.
  const diceValue = this.root.get<number>("diceValue");

  ReactDOM.render(
    <div>
      <span style={{fontSize: 50}}>{this.getDiceChar(diceValue)}</span>
      <button onClick={this.rollDice.bind(this)}>Roll</button>
    </div>,
    div
  );
};

rerender();
```

:::
::: tab VanillaJS

```typescript
private createComponentDom(host: HTMLElement) {
  const diceValue = this.root.get<number>("diceValue");

  const diceSpan = document.createElement("span");
  diceSpan.id = "diceSpan";
  diceSpan.style.fontSize = "50px";
  diceSpan.textContent = this.getDiceChar(diceValue);
  host.appendChild(diceSpan);

  const rollButton = document.createElement("button");
  rollButton.id = "rollButton";
  rollButton.textContent = "Roll";
  rollButton.onclick = this.rollDice.bind(this);
  host.appendChild(rollButton);
}
```
:::
::::
````

**Output**

:::: tabs
::: tab React

```jsx
const rerender = () => {
  // Get our dice value stored in the root.
  const diceValue = this.root.get<number>("diceValue");

  ReactDOM.render(
    <div>
      <span style={{fontSize: 50}}>{this.getDiceChar(diceValue)}</span>
      <button onClick={this.rollDice.bind(this)}>Roll</button>
    </div>,
    div
  );
};

rerender();
```

:::
::: tab VanillaJS

```typescript
private createComponentDom(host: HTMLElement) {
  const diceValue = this.root.get<number>("diceValue");

  const diceSpan = document.createElement("span");
  diceSpan.id = "diceSpan";
  diceSpan.style.fontSize = "50px";
  diceSpan.textContent = this.getDiceChar(diceValue);
  host.appendChild(diceSpan);

  const rollButton = document.createElement("button");
  rollButton.id = "rollButton";
  rollButton.textContent = "Roll";
  rollButton.onclick = this.rollDice.bind(this);
  host.appendChild(rollButton);
}
```
:::
::::


### Varying content by version and audience

Content in the Fluid docs system can vary by _version_ or by _audience_. Several variables are available to use in
Markdown files to enable this, exposed on the `$themeConfig` object:

| `$themeConfig` member   | Description                                                                      |
| ----------------------: | -------------------------------------------------------------------------------- |
| `DOCS_AUDIENCE`         | Will be set to `internal` if the docs are being built for the internal audience. |
| `THIS_VERSION`          | The version of the documentation **currently being built.** E.g. `0.14`          |
| `MASTER_BRANCH_VERSION` | The version of the documentation **on the master branch.**  E.g. `0.16`          |
| `RELEASE_VERSION`       | The current release version of **the Fluid client packages.** E.g. `0.15`        |
| `N1_VERSION`            | The version immediately prior to the release version. E.g. `0.14`                |

#### Conditional sections in Markdown

In a Markdown file, you can make a section conditional like so:

```jsx
<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">
### Some markdown content

This will only render if the variable group is `internal`.
<vue-markdown />
```

Else and else-if block are also supported using the following syntax:

```jsx
<vue-markdown v-if="$themeConfig.THIS_VERSION === '0.16'">
This will only render for version 0.16.
<vue-markdown />
<vue-markdown v-else-if="$themeConfig.THIS_VERSION === '0.15'">
This will only render for version 0.15.
<vue-markdown />
<vue-markdown v-else>
This will render for all versions except 0.15 and 0.16.
<vue-markdown />
```

#### Internal-only navigation

Some entire sections or pages of the documentation should only be included when building for the internal audience.
The navigation is built dynamically in docs/.vuepress/config.js, and you can wrap any navigation item in the
`internalOnly` helper function. This will ensure that the navigation item only renders for the internal audience.


### Diagrams with Mermaid

[Mermaid examples and syntax reference](https://mermaid-js.github.io/mermaid/)

**Input**

```jsx
<mermaid>
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
</mermaid>
```

**Output**

<mermaid>
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
</mermaid>


### Markdown enhancements

#### Typography <Badge text="markdown-it plugin" vertical="middle"/>

Plugin: <https://github.com/markdown-it/markdown-it-deflist>

Ellipsis: ... `...`

Em dash: --- `---`

En dash: -- `--`

Plus/minus: +- `+-`


#### Arrows <Badge text="markdown-it plugin" vertical="middle"/>

Plugin: <https://github.com/adam-p/markdown-it-smartarrows>

--> `-->`

<-- `<--`

<--> `<-->`

==> `==>`

<== `<==`

<==> `<==>`


#### Emoji <Badge text="VuePress feature" vertical="middle"/>

Full list of supported emoji: <https://github.com/markdown-it/markdown-it-emoji/blob/master/lib/data/full.json>

**Input**

```markdown
:tada: :100:
```

**Output**

:tada: :100:


#### Definition lists <Badge text="markdown-it plugin" vertical="middle"/>

Plugin: <https://github.com/markdown-it/markdown-it-deflist>

You can create definition lists using the syntax defined by [PHP Markdown
Extra](https://michelf.ca/projects/php-markdown/extra/#def-list).

**Input**

```markdown
Apple
:   Pomaceous fruit of plants of the genus Malus in
    the family Rosaceae.

Orange
:   The fruit of an evergreen tree of the genus Citrus.
```

**Output**

Apple
:   Pomaceous fruit of plants of the genus Malus in
    the family Rosaceae.

Orange
:   The fruit of an evergreen tree of the genus Citrus.
