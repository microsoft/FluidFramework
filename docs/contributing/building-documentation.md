# Building documentation locally

## Generating API documentation

To build the API documentation, do the following from the root of the repository:

```bash
npm install
npm run build
npm run build:docs
```

This will create many YAML files under `docs/api/`.

> [!IMPORTANT]
> Due to <https://github.com/Microsoft/web-build-tools/issues/1229>, `api-documenter` outputs a
> `toc.yaml` file like this:
>
> ```yaml
> items:
>   - name: SharePoint Framework reference
>     href: ~/overview/sharepoint.md
>     items:
>       - name: sequence
>         uid: sequence
>         items:
>           - name: Interval
>             uid: sequence.Interval
> ```
>
> You need to manually remove the first 3 lines, so you end up with something like this:
>
> ```yaml
> items:
>   - name: sequence
>     uid: sequence
>     items:
>       - name: Interval
>         uid: sequence.Interval
> ```

## Building documentation site with DocFX

Finally, to build the docs themselves, you'll need [DocFX](https://dotnet.github.io/docfx/).
Run `docfx build` from the docs directory. The built docs are put in `docs/_site`.

You can also serve the docs from http://localhost:8080/ by adding `--serve` to the command.
I.e. `docfx build --serve`
