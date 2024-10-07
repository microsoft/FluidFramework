# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

### Installation

```shell
$ pnpm i
```

### Local Development

```shell
$ npm start
```

This command starts a local development server and opens up a browser window.
Most changes are reflected live without having to restart the server.

Note that offline search will not work in this mode.
It requires running a full build to run its indexing.
To test search, you will need to run `npm run build` and `npm run serve`.

### Build

```shell
$ npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.
This includes the generation of API documentation contents.

To *just* build the API documentation, run `build:api-documentation`.
To *just* build the static site (without rebuilding the API documentation), run `build:docusaurus`.

Note: the Docusaurus build is fairly slow.
If you don't need to test search, it is recommended to run `npm start` instead.
This is faster, and will watch for content changes and update automatically.
You will still need to build the API documentation first.

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

### Known issues

-   Figure out solution to markdown-magic in mdx (html comment syntax not supported)
-   Link check doesn't handle custom heading anchors - maybe there is a plugin for this?

### Other TODOs

-   Add component-level unit testing (with accessibility tests)
-   Add end-to-end testing
-   "Local" API docs mode
    -   See https://github.com/microsoft/FluidFramework/pull/20203 for reference
-   Add button for users to report docs issues / edit pages on github
-   Verify specific browser support
-   Remove "new website features" demo page
-   Add prettier (wait until after merge to reduce diff noise)
-   Add markdown-lint (same as above)
-   Add eslint for components

-   Preserve existing redirects that are still needed
    -   TODO
-   Add new redirects to accommodate changes:
    -   `docs/api/v*` => `docs/v*/api`
    -   `docs/data-structures/counter` => `docs/v1/data-structures/counter`
    -   etc.

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


# Local API docs build

`versions.json` cannot contain "local" when building prod.
- Need to gen versions based on env mode.

Need explicit sidebar for local mode - otherwise it gets none.
We can probably check one in, whose API docs section mirrors current.
