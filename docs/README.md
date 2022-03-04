# fluidframework-docs

This is the code and content for <https://fluidframework.com>.

## Previewing the documentation site locally

Open the docs folder in a terminal and install the dependencies using npm.

```bash
cd docs
npm install
```

Then, start the server.

```bash
npm start
```

Open <http://localhost:1313> to preview the site.

### API documentation and Playground

The steps above won't include API documentation (the TSDoc JSON files) or the Playground by default.  You can
download the latest API docs and Playground files with the `download` script.

```bash
npm run download
```

Note that this script will **overwrite any locally built API docs.**

## Building the documentation

Run the `build` script to build the site. The output will be in the `public/` folder.

```bash
npm run build
```

### Drafts and future content

By default the `build` script won't build content with a future published date or draft flag.
To build this content, use the `--buildDrafts` and `--buildFuture` flags.

```bash
npm run build -- --buildDrafts --buildFuture
```

Content with a future published date won't automatically publish on that date.  You'll
need to run the build process.

### API documentation

Building API documentation locally requires an extra step to generate the content from the source.

From the root of the repository:

```bash
npm install
npm run build:fast -- --symlink:full --install --all
npm run build:fast -- -s build -s build:docs --nolint --all
```

You can then build or preview the docs using the steps described earlier.

Note that this will leave the fluid-build tool in full-symlink mode.  To return to the default isolated
mode (e.g. for typical development) run:

```bash
npm run build:fast -- --symlink
```

### Understanding the API documentation build pipeline

If you encounter problems updating or building the API docs, it can be helpful to have a high-level
understanding of how it gets built. The steps are as follows:

1. Root: `build:fast`
    1. Compile the code, generating TypeScript definitions, etc.
1. Root: `build:docs`
    1. Run the @microsoft/api-extractor (using Lerna) in each package to extract documentation info in a JSON format.
       The output is placed in a folder `_api-extractor-temp` in each package's directory.
    1. The JSON is also copied from each package up to a shared `_api-extractor-temp` directory under the repository
       root.
1. `/docs`: `build`
    1. Run markdown-magic to update some shared content in the source Markdown files.
    1. Run the @mattetti/api-extractor tool to transform the JSON format into Markdown.  The generated Markdown is
       placed at `/docs/content/apis`. We maintain this fork of @microsoft/api-extractor
       [here](https://github.com/mattetti/custom-api-documenter).
    1. Run hugo to build the site itself. The generated output is placed at `/docs/public/apis`.
1. `/docs`: `start`
    1. Run the hugo server to host the site at <http://localhost:1313>.

To investigate incorrect output, you can check the intermediate outputs (JSON, Markdown, HTML) at these locations
to narrow down where the error is occurring.

## Creating new content

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

Some template pages include a TOC of the page. This is generated on the fly by reading the
headers.

### Social action

There is a menu with actions such as tweeting the page, subscribing to the feed, asking
questions etc... This is driven from the theme and the information for the accounts should
be in the config.

## Shortcodes

[Shortcodes](https://gohugo.io/content-management/shortcodes/) are custom functions that
can be called from within the Markdown to insert specific content.

## Working on the template

The site theme/template lives in `themes/thxvscode`.

## Scripts

<!-- AUTO-GENERATED-CONTENT:START (SCRIPTS) -->
| Script | Description |
|--------|-------------|
| `build` | Build the site; outputs to `public/` by default. |
| `build:api` | `npm run build:uber-package && npm run build:api-documenter` |
| `build:api-documenter` | Convert API JSON into Markdown. |
| `build:api-documenter:default` | --- |
| `build:api-documenter:win32` | --- |
| `build:api-rollup` | Runs `rollup-api-json.js` to produce rolled-up API data. See the script for more details. |
| `build:fast` | Builds the site in a fast, but incomplete way. Useful for testing and iteration. |
| `build:md-magic` | Updates generated content in Markdown files. |
| `ci:build` | `npm run download && npm run build` |
| `clean` | Remove all generated files. |
| `download` | Download and extract the API JSON and Playground files locally. |
| `download:api` | Download and extract the API JSON files locally. |
| `hugo` | Run the local copy of Hugo. |
| `linkcheck` | `npm run linkcheck:site` |
| `linkcheck:fast` | `linkcheck http://localhost:1313 --skip-file skipped-urls.txt` |
| `lint` | `markdownlint-cli2` |
| `lint:fix` | `markdownlint-cli2-fix` |
| `start` | Start a local webserver to preview the built site on <http://localhost:1313> |
<!-- AUTO-GENERATED-CONTENT:END -->
