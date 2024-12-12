# @fluid-example/ai-collab

This is an example app that showcases the `@fluidframework/ai-collab` package to interact with an LLM (Large Language
Model).

By default it uses Tinylicious as the server, but you can also use SharePoint embedded.
Steps to do that are detailed below.

<!--
NOTE: deliberately skipping the use of AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER) in this package
because it uses a non-standard flow (local npm script to start tinylicious, and uses NextJS with a different URL)
-->

## Pre-requisites

In order for the app to showcase the LLM interaction, you need to provide an OpenAI API key.
Copy the `.env.example` file, rename the copy to `.env`, and replace the value of the `OPEN_AI_KEY` variable with your
API key.
Note that the app leverages the gpt-o4 model and thus an API key for a paid account is required.
If you provide an API key for a free account, the app will still render, but requesting AI assistance will fail.

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/ai-collab`
1. Start a Tinylicious server by running `pnpm start:server` from this directory.
1. In a separate terminal also from this directory, run `pnpm next:dev` and open http://localhost:3000/ in a
    web browser to see the app running.

### Using SharePoint embedded instead of tinylicious

1. Go to [page.tsx](src/app/page.tsx), look for comment
`// Uncomment the import line that corresponds to the server you want to use`, comment the line for tinylicious and
uncomment the line for SharePoint Embedded.
1. In the same `.env` file you created in the pre-requisites section, set the correct values for the following variables:

- `NEXT_PUBLIC_SPE_CLIENT_ID`
- `NEXT_PUBLIC_SPE_CONTAINER_TYPE_ID`
- `NEXT_PUBLIC_SPE_ENTRA_TENANT_ID`

You can get all of them through the [SharePoint Embedded for Visual Studio Code extension](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/spembedded-for-vscode).

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
