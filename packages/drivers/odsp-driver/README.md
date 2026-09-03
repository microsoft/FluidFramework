# @fluidframework/odsp-driver

The ODSP (OneDrive/Sharepoint) driver is an implementation of a Fluid driver that facilitate communication between
the client and the ODSP server to retrieve Fluid content and connect to the Fluid collaboration session.

The ODSP Fluid service is not a publicly available service, and currently it is not possible to use this driver
to connect to it. This driver is present as an illustration of a different Fluid driver implementation.
Developers should not depend on this driver for their own solutions.

## Telemetry Event names to SPO API mapping:

These event names are suffixed by `_end` in case they are successful API calls or by `_cancel` in case they are failures.
In the table I have used the failure ones.

| Event Name | Endpoint | Notes |
|:---|:---|:---|
| fluid:telemetry:OdspDriver:TreesLatest_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream/snapshots/trees/latest?ump=1` | Error when fetching snapshot from storage, typically during document load. (Storage Call) |
| fluid:telemetry:OdspDriver:GetDeltas_cancel<br>fluid:telemetry:OdspDriver:OpsFetch_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream?ump=1&filter=sequenceNumber ge START and sequenceNumber le END` | Error when fetching ops from the storage. (Storage Call) |
| fluid:telemetry:OdspDriver:JoinSession_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream/joinSession?ump=1` | Error when getting the details needed to connect to socket. It is also called every 15 mins to renew session. (Storage Call) |
| fluid:telemetry:BlobManager:AttachmentReadBlob_cancel<br>fluid:telemetry:OdspDriver:readDataBlob_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream/attachments/BLOB_ID/content` | Error when reading attachment blobs (e.g. images). (Storage Call) |
| fluid:telemetry:OdspDriver:createBlob_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream/attachment/content` | Error when creating an attachment blob (e.g. an inserted image). (Storage Call) |
| fluid:telemetry:OdspDriver:CreateNewFile_cancel | `/_api/v2.1/drives/DRIVEID/items/root:%2f<path>.fluid:/opStream/snapshots/snapshot?ump=1` | Error when creating a new Fluid file, during Container Attach. (Storage Call) |
| fluid:telemetry:OdspDriver:createNewEmptyFile_cancel | `/_api/v2.1/drives/DRIVEID/items/root://FILEPATH/FILENAME:/content?@name.conflictBehavior=rename&select=id,name,parentReference&ump=1` | Error when creating a new empty Fluid file. When we have attachment blobs in detached container, we first create empty file, then upload attachment blobs and then upload summary so that summary can refer to those blobs. (Storage Call) |
| fluid:telemetry:OdspDriver:uploadSummary_cancel | `/_api/v2.1/drives/DRIVEID/items/ITEMID/opStream/snapshots/snapshot` | Error when uploading Fluid summary to storage. (Storage Call) |
| fluid:telemetry:OdspDriver:RedeemShareLink_cancel | `_api/v2.0/shares/${encodedShareUrl}/driveItem` | Error when redeeming the share link after single Round Trip redeem during snapshot fetch already failed. [Read more about single RT Redeem here.](#snapshot-api) |
| OdspDriver:odspFileLink_cancel<br>OdspDriver:getShareLink_cancel | `/_api/v2.0/drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl,sharepointIds` | Error when fetching sharing link with `requestName` = `getFileItemLite` in Telemetry. `getShareLink` event is parent of `odspFileLink` event. |
| OdspDriver:odspFileLink_cancel<br>OdspDriver:getShareLink_cancel | `/_api/web/GetFileById(@a1)/ListItemAllFields/GetSharingInformation?@a1=guid${encodeURIComponent(`'${fileItem.sharepointIds.listItemUniqueId}'`)}` | Error when fetching sharing link with `requestName` = `getSharingInformation` in Telemetry. `getShareLink` event is parent of `odspFileLink` event. |

<!-- markdown-magic:begin {"transform":"library-readme-header","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/odsp-driver
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` APIs from `@fluidframework/odsp-driver`.

Import the `legacy` APIs from `@fluidframework/odsp-driver/legacy`.

## API Documentation

Read the **@fluidframework/odsp-driver** API documentation at <https://fluidframework.com/docs/apis/odsp-driver>.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

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

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

* The configuration works but needs official support.
* The configuration does not work and requires changes.

### Supported Runtimes

* Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
  * Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
  * Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
* Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

* [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
  * Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
  * Set the build targets (`lib`, `target`) to `ES2022` or later.
  * Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
  * Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
  * Fluid Framework does not fully support `exactOptionalPropertyTypes`.
    If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
    These methods can incorrectly exclude `undefined` from the possible values.
* [webpack](https://webpack.js.org/) 5
  * We do not require a specific bundler.
    Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

* ES Modules:
  Use ES Modules to consume Fluid Framework client packages, including in Node.js.
* CommonJS:
  Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

* Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
* [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
* Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->
