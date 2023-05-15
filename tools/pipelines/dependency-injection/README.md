# Pipeline Dependency Injection

This directory contains a minimal package.json file with dependencies on various packages we'd like to inject into
our test code during a pipeline run. The file is called `_package.json` to avoid being installed with the rest of the
repo, but only when being used explicitly in a pipeline (at which point it's renamed to remove the underscore)

## Important note about updating the dependencies

The pipeline installs via `npm ci`, using `_package-lock.json` renamed as `package-lock.json`.
So whenever new dependencies are required, you need to:

```bash
cp _package.json package.json
npm install
cp package-lock.json _package-lock.json
```

And then commit the updated `_package-lock.json`.
