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

First, regex find and replace `\{\{< callout (.*?) >\}\}` with `:::$1`.
Then, handle the closing tags via simple find and replace of `{{< /callout >}}` with `:::`.
Do make sure that both the open and closing `:::` lines are surrounded by blank lines to ensure `prettier` compat.

#### `relref` links

We use `relref` shortcode links throughout our documentation.
These are not supported by Docusaurus.
Unfortunately, migrating these must be done manually (for now), since Docusaurus doesn't (yet) support the ability to link to other files by some stable identifier (see https://github.com/facebook/docusaurus/discussions/7380).
We may be able to create supporting infrastructure for something like this on our own, but for now we have to write manual links.

## TODOs

- Link check doesn't handle custom heading anchors - maybe there is a plugin for this?
- Add prettier
- Add markdown-lint
- Add eslint for components
- Inject Docusaurus front-matter in generated API docs
