# @fluidframework/odsp-driver

The ODSP (OneDrive/Sharepoint) driver is an implementation of a Fluid driver that facilitate communication between
the client and the ODSP server to retrieve Fluid content and connect to the Fluid collaboration session.

The ODSP Fluid service is not a publicly available service, and currently it is not possible to use this driver
to connect to it. This driver is present as an illustration of a different Fluid driver implementation.
Developers should not depend on this driver for their own solutions.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## ODSP APIs

Documenting some basics about opds-driver specific apis that are relevant for creation or loading of a Fluid file from ODSP.

### /snapshot API

-   Creates a new Fluid file with the contents as the summary provided in the request body.
-   The creation of file along with the summary is done in a single api call to reduce the number of round trips during new file creation.
-   Also supports creation of sharing link for the file if appropriate request headers are provided in the api call. This feature was introduced to save the number of round trips that a host app makes while creating a file and then creating a sharing link.
    1.  Earlier only `&createLinkType=csl` parameter was supported which could create organizational scoped sharing links. Feature is gated by `enableShareLinkWithCreate` provided via `HostStoragePolicy`. (createLinkType is now deprecated, so prefer using option 2 below)
    1.  Now, providing appropriate values for `&createLinkScope` and `&createLinkRole` request parameters will let you create sharing links with various permission scopes. See `resolvedUrl` definition for more details. Feature is gated by `enableSingleRequestForShareLinkWithCreate ` provided via `HostStoragePolicy`.

### /trees/latest API

-   Fetches the snapshot of an existing Fluid file.
-   Earlier, application needed to redeem the sharing link of the file before a /trees/latest fetch could be made. To reduce the number of round trips made to ODSP, redemption of the share link now happens along with fetching latest snapshot in the same api request by passing share link in `&sl` request parameter.
-   This api is also preflight-less, which means it is not preceded by an OPTIONS call in the browsers to reduce the network trips to the server.

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
