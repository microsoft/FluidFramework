# Building documentation locally

## Generating API documentation

To build the API documentation, do the following from the root of the repository:

```bash
npm install
npm run build
npm run build:docs
npm run build:gendocs
```

The `build:docs` script will generate a JSON representation of all the TSDoc comments, and then `build:gendocs` will
convert that to a tree of markdown files, under `docs/api/`. These files should _not_ be committed to git.

You may run the `build` and `build:docs` scripts from a particular package directory, but `build:gendocs` can only be
run from the root.

## Building documentation site with Vuepress

To build the docs themselves, you'll need to switch to the `docs/` folder, install the dependencies, and then build the
site.

```bash
cd docs
npm install
npm start
```

`npm start` will serve the local documentation from <http://localhost:8080/>.
