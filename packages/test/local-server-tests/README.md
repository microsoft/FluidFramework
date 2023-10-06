# @fluid-private/local-server-tests

This package should contain tests that can only run against local server. This means that they require access to the local server, or local server driver to perfrom their tests. Most test should be written in the end to end test package as tests that require the local server should be few and far between.

Test that would need to be in this package are tests that use the following methods:

-   `LocalDocumentServiceFactory.disconnectClient(...)`
-   `LocalDocumentServiceFactory.nackClient(...)`

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
