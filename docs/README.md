# FluidFramework.com Website

This repo hosts the code for https://fluidframework.com

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Contributing documentation


### Setup

The Fluid website is a generated static website based on content found in this
repository. To contribute new content, or to preview the site, you need to
install [Hugo](https://gohugo.io), [instructions
here](https://gohugo.io/getting-started/installing/).

Once you have Hugo installed, you can start the server:

```bash
hugo server
```


And open `http://localhost:1313` to preview the site. Any changes to the source
content will automatically force an HTML re-render allowing you to preview your
modications in quasi real time.

If you want to debug the generated content, you can build the site and see the
output in the `public/` folder:

```bash
hugo
```

Note that content with a published date in the future or draft flag on won't be
rendered, you can pass 2 extra flags to preview this content.

```bash
hugo  server --buildDrafts --buildFuture
```

If you create a content with a future published date, it won't be automatically
published at that time, you need to trigger the build process.


## New Content

You need to generate new content manually by creating new files by hand or by
generating them using the `hugo` command as shown below:

### Static doc

```bash
hugo new docs/concepts/flux-capacitor.md
```

### Blog post

```bash
hugo new posts/fluid-everywhere.md
```

### Content guidelines

Try to use markdown as much as possible, while we enabled HTML embedding in
Markdown, it is recommended to stick to md and shortcodes/partials.

## Menus

Menus are mainly managed in config.toml but depending on the menu, the sub
headers might be driven by the content in the repo (pages or data files).

### Main menu (top menu)

The top menu is configured in the `config.toml` file and can look like that:

```toml
[menu]

[[menu.main]]
name = "What is Fluid?"
url = "/what-is-fluid"
weight = -100

[[menu.main]]
name = "Docs"
url = "/docs/"
weight = -90

```

### Docs menu

The docs menu is implemented in the theme's `_partial/docNav.html` and is using
the `config.toml` to find the headers and then uses the area attribute of each
sub section (sub folders in the content folder) to populate the pages displayed
in the menu.

Here is an example of what `config.toml` could contain:

```toml
[[menu.docs]]
identifier = "get-started"
name = "Get Started"
weight = -100

[[menu.docs]]
identifier = "concepts"
name = "Main concepts"
weight = 0
```

Those are headers for the Docs menu, they each have a `name` field which us used
to display the header in the menu. They also have an `identifier` key which is
used to map content with matching `area` field (often set to cascade within a
sub folder). Finally, you have a `weight` field that is used to decide the
positioning of each item in the menu. The lighter an item is, the higher it goes
in order (closer to the top).


### API menu

The API menu is a bit more complex since it's driven by content. The left menu
(API overview) is a list of grouped packages, the grouping comes from a yaml
file in the `data` folder. The API documentation is being generated with
metadata which allows the template to link pages and load the right information.

### Table of Contents

Some template pages include a TOC of the page, this is generated on the fly by
reading the headers.

### Social action

There is a menu with actions such as tweeting the page, subscribing to the feed,
asking questions etc... this is driven from the theme and the information for
the accounts should be in the config.


## Shortcodes

Shortcodes are custom functions that can be called from within the Markdown to
insert specific content.



## Working on the template

If you need to work on the scss you need to install [hugo extended](https://gohugo.io/getting-started/installing/).

The template lives in `themes/thxvscode`.


## Generating API docs

The API docs comes from the main code repo where the code is compiled and the
API is extracted using api-extractor. The json output is then converted in this
repo into markdown via a fork of the api-documenter tool.

The code lives in `scripts/`

```bash
cd scripts/api-documenter
npm install
bin/api-documenter generate --input-folder ../../assets/doc-models --output-folder ../../content/apis/
```

This will regenerate the `content/api/*.md` files from the provided json files (which are expected to be in `assets/doc-models`).

### Updating the API generator code


Modify the code.
Compile from TS to js, run the test suite and regenerate the doc:

```
cd scripts/api-documenter/
npm run build
bin/api-documenter generate --input-folder ../../assets/doc-models --output-folder ../../content/apis/
```