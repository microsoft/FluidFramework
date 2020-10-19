# fluidframework-docs

This is the code and content for <https://fluidframework.com>.

## Contributing documentation

### Setup

The Fluid website is a generated static website based on content found in this
repository. To contribute new content, or to preview the site, you need to
use Hugo. It will automatically be downloaded as part of the setup steps below.

Open the docs folder in a terminal and install the dependencies using npm.

```bash
cd docs
npm install
```

This will download all dependencies, including Hugo.

#### Using Hugo manually (optional)

You can install Hugo manually if you want. Use the [instructions on the Hugo
site](https://gohugo.io/getting-started/installing/) to download it.

### Previewing the site

Once you have Hugo installed you can then start the
developer preview site like so:

```bash
npm start
```

Open `http://localhost:1313` to preview the site. Any changes to the source
content will automatically force an HTML re-render allowing you to preview your
modifications in quasi real time.

If you want to debug the generated content, you can build the site and see the
output in the `public/` folder:

```bash
npm run build
```

Note that content with a published date in the future or draft flag on won't be
rendered, you can pass two extra flags to preview this content.

```bash
npm run build -- --buildDrafts --buildFuture
```

If you create a content with a future published date, it won't be automatically
published at that time; you need to trigger the build process.

## New content

You need to generate new content manually by creating new files by hand or by
generating them using the `hugo` command as shown below:

### Static doc

```bash
npm run hugo -- new docs/concepts/flux-capacitor.md
```

### Blog post

```bash
npm run hugo -- new posts/fluid-everywhere.md
```

### Content guidelines

Try to use Markdown as much as possible. You can embed HTML in Markdown, but we
recommended sticking to Markdown and shortcodes/partials.

## Menus

Menus are mainly managed in `config.yml` but depending on the menu, the sub
headers might be driven by the content in the repo (pages or data files).

### Main menu (top menu)

The top menu is configured in the `config.yml` file and can look like this:

```yaml
menu:
  main:
  - name: "Docs"
    url: "/docs/"
    weight: -90
  - name: "API"
    url: "/apis/"
    weight: -80
  - name: "Blog"
    url: "/posts/"
    weight: -50
```

### Docs menu

The docs menu is implemented in the theme's `_partial/docNav.html` and is using the
`config.yml` to find the headers and then uses the area attribute of each sub section (sub
folders in the content folder) to populate the pages displayed in the menu.

Here is an example of what `config.yml` could contain:

```yaml
menu:
  docs:
  - identifier: "get-started"
    name: "Get Started"
    weight: -500
  - identifier: "concepts"
    name: "Main concepts"
    weight: -300
  - identifier: "faq"
    name: "FAQ"
    url: "/docs/faq/"
    weight: -100
```

Those are headers for the Docs menu, they each have a `name` field which is used to
display the header in the menu. They also have an `identifier` key which is used to map
content with matching `area` field (often set to cascade within a sub folder). Finally,
you have a `weight` field that is used to decide the positioning of each item in the menu.
The lighter an item is, the higher it goes in order (closer to the top).

### API menu

The API menu is a bit more complex since it's driven by content. The left menu (API
overview) is a list of grouped packages, the grouping comes from a yaml file in the `data`
folder (`packages.yaml`). The API documentation is being generated with metadata which
allows the template to link pages and load the right information.

### Table of Contents

Some template pages include a TOC of the page, this is generated on the fly by reading the
headers.

### Social action

There is a menu with actions such as tweeting the page, subscribing to the feed, asking
questions etc... This is driven from the theme and the information for the accounts should
be in the config.

## Shortcodes

[Shortcodes](https://gohugo.io/content-management/shortcodes/) are custom functions that
can be called from within the Markdown to insert specific content.


## Working on the template

The template lives in `themes/thxvscode`.


The API docs comes from the FluidFramework repo where the code is compiled and the API is extracted using api-extractor.
The JSON output is then converted into Markdown via [a fork of the api-documenter
tool](https://github.com/mattetti/custom-api-documenter).

## Generating API documentation

_Note: you only need to do this if you want to preview the API documentation (that is,
everything in the API section of the docs). Otherwise skip this._

### Download the latest

You can download the latest API docs and Playground content using the `download` script:

```bash
npm run download
```

This is faster and simpler than building them yourself, especially if you're not making
changes to the API docs themselves.


### Build it yourself

To build the API documentation from your local repo, do the following from the root of the repository:

```bash
npm install
npm run build:fast -- --symlink:full --install --all
npm run build:fast -- -s build -s build:docs --nolint --all
```

_Note that this can take 5-10 minutes for all the steps combined._

You can then build or preview the docs using the steps described earlier.

### Updating the API generator code

Send PRs to [this repo](https://github.com/mattetti/custom-api-documenter).

## Scripts

<!-- AUTO-GENERATED-CONTENT:START (SCRIPTS) -->
| Script | Description |
|--------|-------------|
| `prebuild` | `concurrently "npm:build:md-magic" "npm:build:api-documenter" "npm:build:images"` |
| `build` | Build the site; outputs to `public/` by default. |
| `build:api-documenter` | Convert API JSON into Markdown. |
| `build:api-documenter:default` | -- |
| `build:api-documenter:win32` | -- |
| `build:images` | `java -jar bin/ditaa.jar content/docs/concepts/images/architecture.ditaa -rovT` |
| `build:md-magic` | Updates generated content in Markdown files. |
| `clean` | Remove all generated files. |
| `download` | Download and extract the API JSON and Playground files locally. |
| `download:api` | Download and extract the API JSON files locally. |
| `download:playground` | Download and extract the Playground files locally. |
| `hugo` | Run the local copy of Hugo. |
| `hugo:default` | --- |
| `hugo:win32` | --- |
| `install:ditaa` | `download ` |
| `install:hugo` | Install the version of Hugo used by the documentation. |
| `postinstall` | -- |
| `postinstall:default` | -- |
| `postinstall:win32` | -- |
| `start` | Start a local webserver to preview the built site on <http://localhost:1313> |
| `start:default` | -- |
| `start:win32` | -- |
<!-- AUTO-GENERATED-CONTENT:END -->
