# Documentation

## Building API documentation

To build the API documentation, do the following:

```
cd routerlicious
npm install
npm run build
npm run build:docs
```

Once that's done, you can transform the API docs into YAML for DocFX using `api-documenter`. Install it using 
`npm install -g @microsoft/api-documenter@beta`, then run the following command from the `docs` folder:

```
api-documenter yaml -i ../routerlicious/packages/_api-extractor-temp/doc-models/ -o ./api/
```

This will create many YAML files under `docs/api/`.

**Note:** Due to <https://github.com/Microsoft/web-build-tools/issues/1229>, `api-documenter` outputs a
`toc.yaml` file like this:

```yaml
items:
  - name: SharePoint Framework reference
    href: ~/overview/sharepoint.md
    items:
      - name: sequence
        uid: sequence
        items:
          - name: Interval
            uid: sequence.Interval
```

You need to manually remove the first 3 lines, so you end up with something like this:

```yaml
items:
  - name: sequence
    uid: sequence
    items:
      - name: Interval
        uid: sequence.Interval
```

Finally, to build the docs themselves, you'll need [DocFX](https://dotnet.github.io/docfx/).
Run `docfx build` from the docs directory. The built docs are put in `docs/_site`.
