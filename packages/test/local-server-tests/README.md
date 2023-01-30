# @fluid-internal/local-server-tests

This package should contain tests that can only run against local server. This means that they require access to the local server, or local server driver to perfrom their tests. Most test should be written in the end to end test package as tests that require the local server should be few and far between.

Test that would need to be in this package are tests that use the following methods:

-   `LocalDocumentServiceFactory.disconnectClient(...)`
-   `LocalDocumentServiceFactory.nackClient(...)`
