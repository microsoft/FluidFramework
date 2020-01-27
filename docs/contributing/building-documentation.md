# Building documentation locally

## Generating API documentation

To build the API documentation, do the following from the root of the repository:

```bash
npm install
npm run build
npm run build:docs
```

This will create many Markdown files under `docs/api/`. These files should *not* be committed to git.

## Building documentation site with Vuepress

To build the docs themselves, you'll need to switch to the `docs/` folder, install the dependencies, and then build the
site.

```bash
cd docs
npm install
npm start
```

`npm start` will serve the local documentation from http://localhost:8080/.
