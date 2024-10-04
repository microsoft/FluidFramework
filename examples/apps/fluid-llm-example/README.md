# @fluid-experimental/fluid-llm-example

WIP

## Known Issues and Limitations

WIP

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

The next steps in LLM/AI based collaborative experiences with applications involves
allowing LLM's to propose updates to application state directly.

## The classic LLM developer experience & it's problems

The classic LLm dev exeperience involves crafting a prompt for an an LLM with some information about your ap, then having the LLM response in a parseable format.

From here the developer needs to:
1. Translate & interpet the LLM response format so it can be applied to their application state
2. Deal with potentially invalid responses
3. Deal with merging LLM responses that use potentially stale state into their apps.
    - This in particular comes into play with more dynamic application state, for example some kind of a list that users can add & remove from. You'll need to make sure the LLM isn't trying to delete something that doesn't exist or overwrite something that no longer makes sense.
4. Try to preview LLM changes to the user before accepting them. This requires maintaining a pre change branch, merged branched and post change branch

Scenario: say you want an llm to make offline changes

### How this library fixes things

Newer LLM developer tooling has solved issue #1 in a variety of ways, getting the LLM to respond with a format that you can merge into your app and ensuring that the JSON response schema is valid. However, problems 3-4 still exist and the current landscape requires bespoke, per-app solutions for dealing with this. This library simplifies these issues.






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
