# @fluid-experimental/tree-react-api

<!-- AUTO-GENERATED-CONTENT:START (README_PACKAGE_SCOPE_NOTICE) -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

<!-- AUTO-GENERATED-CONTENT:END -->

Utilities for using SharedTree with React.

This package aims to assist SharedTree based React applications handle some common cases by providing code such applications can share.
This should improve the quality of such applications by allowing them to share and improve a single implementation of this logic
(for example ensuring they all handle out of schema documents properly), while reducing the need for boilerplate.

## Known Issues and Limitations

These are a mix of issues encountered when authoring this package, as well as limitation of this package.

Some of this logic would be useful for non-react applications: to avoid creating even more septate packages, that logic is not split into its own package.
If there is clear demand for this to be done, it might be done in the future.

There is no service implementation agnostic client abstraction that can be referred to here (ex: shared by TinyliciousClient, AzureClient and OdspClient).
This makes documenting compatibility with that implicit common API difficult.
It also makes writing service agnostic code at that abstraction level harder.

There does not appear to be a local service implementation of the above mentioned abstraction, which makes testing the code in the package harder.

The commonly used boilerplate for setting up a ContainerSchema based application configures the dev-tools,
but currently can't be included in this package due to dependency layering issues.

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
