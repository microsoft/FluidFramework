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

## WIP Notes

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
import { PackageLink } from "@site/src/components/shortLinks" // Best practice: put this at the top of the file

...

<PackageLink packageName="azure-client">@fluidframework/azure-client</PackageLink>
```

## TODOs

- Link check doesn't handle custom heading anchors - maybe there is a plugin for this?
- Add prettier
- Add markdown-lint
- Add eslint for components
- Inject Docusaurus front-matter in generated API docs
- Verify high contrast support
