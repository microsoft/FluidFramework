# @fluid-example/bundle-size-tests

This package bundles some commonly used Fluid packages. The webpack output of this package is used for bundle analysis in our ongoing effort to make Fluid fast!

## Comparing bundle sizes

This package can measure how a change affects its webpack bundle by building the
bundle on two different revisions and diffing the per-asset and per-entrypoint
sizes, so regressions (or wins) are easy to spot before pushing.

The workflow is implemented as the `flub bundle` command topic in
[`@fluid-tools/build-cli`](../../../build-tools/packages/build-cli); this package
just invokes it with the appropriate context. See
[bundleDetails.md](../../../build-tools/packages/build-cli/docs/bundleDetails.md)
for how the commands fit together and how to read the comparison report.

### Running

The orchestrator is exposed as the `compare:bundles` npm script:

```sh
npm run compare:bundles
```

To pass flags, forward them after `--`:

```sh
npm run compare:bundles -- --base-revision client_v2.100.0
```

This compares your working tree against the merge-base of `HEAD` and `main` —
i.e. the point your branch forked from — so the diff reflects only your own
changes, not unrelated commits that have since landed on `main`.

### Outputs

- Each label's `analyzer.json` is saved under `bundleAnalysis/<label>/`
  (gitignored). This is also where the cached base report and the inner repo
  clone live.
- Comparison reports (`.txt` and `.json`) are written to `compareBundlesOutput/`
  (gitignored).

Both directories are removed by `npm run clean`.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
