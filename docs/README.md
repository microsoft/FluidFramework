# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

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
However, a reusable React component was added to `src/components/shortLink.tsx` that can be leveraged instead for the same purpose.

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

-   Prototype versioning
-   Figure out solution to markdown-magic in mdx (html comment syntax not supported)
-   Link check doesn't handle custom heading anchors - maybe there is a plugin for this?
-   Add prettier (wait until after merge to reduce diff noise)
-   Add markdown-lint (same as above)
-   Add eslint for components
-   Verify specific browser
