# Contributing

This project welcomes contributions and suggestions. Detailed instructions for working in the repo
can be found in the [Wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

Dependency changes from external contributors are welcome, but will require some additional steps.
The repository is configured to use a public Azure Artifacts feed as its registry (see .npmrc / pnpm-workspace files).
External contributors do not have permissions to cause that feed to save new packages from upstream npmjs.
At development time, such contributors can modify the npmrc and pnpm-workspace files to reference registry.npmjs.org (or some other feed of their choice).
A Fluid Framework maintainer will then need to update lock files at PR time after confirming the dependency updates are reasonable.
See [Dependency setup and changes](./docs/content/Contributing/Dependencies.md) for the contribution and authentication steps.

Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to,
and actually do, grant us the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide a CLA and decorate
the PR appropriately (e.g., label, comment). Simply follow the instructions provided by the bot. You will only need to
do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact
[opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
