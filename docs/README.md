# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```shell
$ pnpm i
```

## Local Development

There are two options for local testing.

### `build:api-documentation` and `start`

The easiest way to get started testing the website is to leverage Docusaurus's `start` functionality.
This command starts a local development server and opens up a browser window.
Most changes are reflected live without having to restart the server.

Before you can use this, you'll need to ensure our API documentation has been built.
So start by running:

```shell
npm run build:api-documentation
```

Then, run:

```shell
$ npm start
```

#### Limitations

Note: the following functionality will not work in this mode.
Instead, you will need to [build](#build) and [serve](#serve)

Note that offline search will not work in this mode.
It requires running a full build to run its indexing.
To test search, you will need to use the [`build` and `serve`](#build-and-serve) workflow.

### `build` and `serve`

The second option, which is substantially slower, leverages the same build that our build pipelines use to generate our production site.
First, run:

```shell
$ npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.
This includes the generation of API documentation contents.

To *just* build the API documentation, run `build:api-documentation`.
To *just* build the static site (without rebuilding the API documentation), run `build:docusaurus`.

Then, run:

```shell
npm run serve
```

Note: the Docusaurus build is fairly slow.
If you don't need to test search, it is recommended to run `npm start` instead.
This is faster, and will watch for content changes and update automatically.
You will still need to build the API documentation first.

### Local API docs build

To include the repo-local API docs in the build, first build the code from the root of the repo, then run `build:dev` or `build:api-documentation:dev` from this directory.
This will generate a "local" docs version (in addition to the production versions), which strictly includes API documentation generated from the local build artifacts.
So long as the API documentation was generated in this manner, those docs will be viewable regardless of how to run Docusaurus (`npm start` or `npm run serve`).

To remove the local docs view, simply run `npm run clean` and re-run the build without the `:dev` postfix.

## Docs Versioning

TODO

## Docusaurus

### Notes

Documents created under `/docs` will be included in auto sidebar generation / contribute to default hierarchy.
Documents created under `src/pages` will not.
See https://docusaurus.io/docs/creating-pages.

### Copying from Hugo

#### Callouts

Hugo's Callout syntax is not supported by Docusaurus, but it can be easily mapped to [Docusaurus Admonitions](https://docusaurus.io/docs/markdown-features/admonitions).

E.g.,

```md
{{< callout note >}}
...
{{< /callout >}}
```

or

```md
{{% callout note %}}
...
{{% /callout %}}
```

Can be replaced with (`.mdx` only):

```mdx
:::note

...

:::
```

Callouts with "titles" can be migrated as follows:

```md
{{% callout tip "Title text" %}}
...
{{% /callout %}}
```

becomes

```mdx
:::tip[Title text]

...

:::
```

#### `relref` links

We use `relref` shortcode links throughout our documentation.
These are not supported by Docusaurus.

These can be replaced using standard Markdown link syntax.

#### `packageref` links

Similar to the above, this shortcode syntax is not supported.
However, a reusable React component was added to `src/components/shortLinks.tsx` that can be leveraged instead for the same purpose.

E.g.,

```md
[@fluidframework/azure-client]({{< packageref "azure-client" >}})
```

Can be replaced with (`.mdx` only):

```mdx
import { PackageLink } from "@site/src/components/shortLinks"; // Best practice: put this at the top of the file

...

<PackageLink packageName="azure-client">@fluidframework/azure-client</PackageLink>
```

Note: the `packageref` shortcode provided support for specifying an API version.
This support has not been translated to the new React component, as we now version the entire site, rather than only versioning API docs.
As a result, the version linked to will always be the same as the version of the docs using specifying the link.

#### `apiref` links

Similar to the above, this shortcode syntax is not supported.
However, a reusable React component was added to `src/components/shortLinks.tsx` that can be leveraged instead for the same purpose.

E.g.,

```md
[@fluidframework/azure-client]({{< apiref "azure-client" "AzureClient" "class" >}})
```

Can be replaced with (`.mdx` only):

```mdx
import { ApiLink } from "@site/src/components/shortLinks"; // Best practice: put this at the top of the file

...

<ApiLink packageName="azure-client" apiName="AzureClient" apiType="class">Azure Client</ApiLink>
```

Note: the `apiref` shortcode provided support for specifying an API version.
This support has not been translated to the new React component, as we now version the entire site, rather than only versioning API docs.
As a result, the version linked to will always be the same as the version of the docs using specifying the link.

### MDX

MDX syntax (supported by Docusaurus) is powerful.
But there is a subset of standard Markdown syntax that is not supported.
For example, any HTML-like syntax will _always_ be treated as JSX syntax, so standard embedded HTML patterns don't work.
Most of the time, this isn't an issue, since substituting JSX syntax is generally fine.
With some exceptions.

#### Comments

A common pattern for adding inline comments in `.md` files looks like:

```md
<!-- I am a comment -->
```

The replacement syntax to use in `.mdx` files would be:

```mdx
{/* I am a comment */}
```

(just like you would do in a JSX context!)

#### Other best practices

-   Don't include file extensions in links. E.g., prefer `[foo](./foo)` over `[foo](./foo.md)`.

## TODOs

### Critical

-   Fix links on Community page
    -   Icons are not currently links, while they are on the old site. Should be an easy fix.
-   Restore link check scripts (restore related infra from main branch - it should be able to work the same as it did before)
    -   Docusaurus validates links between the pages it serves, but it won't validate links to external URLs, nor to static contents.
        So we still want this validation.
-   Preserve existing redirects that are still needed
    -   `docs/apis` => `docs/api`
    -   TODO: what else?
-   Add new redirects to accommodate changes:
    -   `docs/api/v*` => `docs/v*/api`
        -   TODO: verify this is okay for v2 which is "current"
    -   `docs/data-structures/counter` => `docs/v1/data-structures/counter`
    -   TODO: what else?
-   Review content changes with tech writer
    -   Structural changes (contents added/removed by version)
        -   \- Tree.md for v1
        -   \- Counter.md for v2
        -   TODO: what else?
    -   Content changes:
        -   `/docs/api/index.mdx`
        -   `/versioned_docs/api/index.mdx`
        -   TODO: what else?

### Nice to have before merging into main

-   Ensure code blocks include a copy button
-   Add component-level unit testing (with accessibility tests)
-   Add end-to-end testing
-   Add eslint for components

### After merging into main

-   Add prettier (wait until after merge to reduce diff noise)
-   Add markdown-lint (same as above)
-   Figure out solution to markdown-magic in mdx (html comment syntax not supported)

### Before merging into main


## Site changes relative to current website

### Versioning

The existing Hugo-based site only has a partial versioning story.
The API docs are versioned, but the rest of the content isn't.
This creates a messy story where our hand-written docs likely only discuss topics related to the current version, and we have no place to put docs discussing earlier versions.
Or, even worse, we have a mixed bag of documentation for different versions, creating a very unclear user story.

This prototype includes an end-to-end versioning story, [automated by Docusaurus](https://docusaurus.io/docs/versioning).
Current (v2) docs live under `docs`.
Old (v1) docs live under `versioned_docs/version-1`.

Most of the documentation has been duplicated between the two versions, but some minor changes have been made to make the docs better line up with the corresponding version of the API.
These changes should be reviewed before being merged into main / deploying the new website.

### Search

This branch includes an offline implementation of search.
An offline solution comes with some downsides (slower build, larger bundle), and probably isn't what we want long term.
That said, it is much better than what our current website has (no search whatsoever).

We should come back to this after v1 of our new website.
