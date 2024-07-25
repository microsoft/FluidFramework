# @fluid-tools/fetch-tool

Connection using ODSP or routerlicious driver to dump the messages or snapshot information on the server.
In order to connect to ODSP, the clientID must be set as the environment variable `fetch__tool__clientId`. If you have access to the keyvault this can be done by running [this tool](../../../tools/getkeys).
Beware that to use fetch-tool on documents in the Microsoft tenant, you will need to follow the fetch tool usage instructions on the "Debugging Tools" page of the internal Fluid wiki.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:installation=TRUE&devDependency=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is a library intended for use within the [microsoft/FluidFramework](https://github.com/microsoft/FluidFramework) repository.**
**It is not intended for public use.**
**We make no stability guarantees regarding this library and its APIs.**

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-tools/fetch-tool -D
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

    Usage: fluid-fetch [options] "URL"
    URL: <ODSP joinSession URL>|<Routerlicious URL>
    Options:
      --dump:rawmessage               : dump all messages
      --dump:rawmessage:overwrite     : dump all messages and overwrite existing        messages.json
      --dump:snapshotVersion          : dump a list of snapshot version
      --dump:snapshotTree             : dump the snapshot trees
      --dump:snapshotBlob             : dump the contents of snapshot blobs
      --stat:message                  : show a table of message type counts and size
      --stat:snapshot                 : show a table of snapshot path and blob size
      --stat:dataType                 : show a table of data type
      --stat:channel                  : show a table of channel
      --filter:messageType <type>     : filter message by <type>
      --jwt <token>                   : token to be used for routerlicious URLs
      --numSnapshotVersions <number>  : Number of versions to load (default:10)
      --snapshotVersionIndex <number> : Index of the version to dump
      --saveDir <outdir>              : Save data of the snapshots and messages
      --loginHint <user>              : Username to prefill for interactive authentication against ODSP

### Tips

-   If not done already run `npm run build`
-   Example command - run `node lib/fluidFetch.js --saveDir example 'get-versions-fetch-url'` in the `fetch-tool` directory
    -   Look at the `getVersions` call in the relevant driver to build the right url
    -   If you have access to the document, you can also look at the standard browser devtools and look for the url there as well.
    -   This command creates an `example` directory (if it doesn't exist) in the `fetch-tool` folder.
    -   If run multiple times without clearing the `example` directory, the snapshot will overwrite any old folders or files.
-   Looking at the `example` directory:
    -   Go to `1-XYZ/decoded/tree.json` to see the snapshot tree.
    -   Each `'#-XYZ'` string in the `tree.json` correlates to a file in the decoded folder. These files are essentially blobs.
    -   `0-XYZ/decoded/tree.json` is an older snapshot tree.
    -   The `messages.json` is a list of ops/messages that are stored.
-   For 401 authentication errors, as stated above, check that [getkeys](../../../tools/getkeys) has been run.

## Example Output

### Messages Stats

**--stat:message**

    105 total messages (103 delta storage, 2 initial ws messages, 0 dup)
    Message Type (All)                                                       | Count      Bytes
    ----------------------------------------------------------------------------------------------------
    join                                                                     |    19       7588
    propose                                                                  |     1        269
    noop                                                                     |    15       2806
    attach                                                                   |     1        278
    op                                                                       |    53      23854
    leave                                                                    |    16       3810
    ----------------------------------------------------------------------------------------------------
    Total                                                                    |   105      38605

**--stat:dataType**

    107 total messages (105 delta storage, 2 initial ws messages, 0 dup)
    Data Type (Operations only)                                              | Count      Bytes
    ----------------------------------------------------------------------------------------------------
    map                                                                      |    28      13172
    mergeTree                                                                |    20       7450
    ----------------------------------------------------------------------------------------------------
    Total                                                                    |    48      20622

**--stat:channel**

    109 total messages (107 delta storage, 2 initial ws messages, 0 dup)
    Channel name (Operations only)                                           | Count      Bytes
    ----------------------------------------------------------------------------------------------------
    [defaultDataStore]/root (map)                                            |     3       1232
    [defaultDataStore]/0fb26504-369f-4234-ad97-0a303d3ec81f (map)            |     0          0
    [defaultDataStore]/74577601-3af5-49a1-9ca5-db5d9ee128a8 (mergeTree)      |    20       7450
    [defaultDataStore]/91ac6df2-dda6-409a-b5e3-be84ce9ab138 (map)            |    25      11940
    [defaultDataStore]/92ebb388-68a0-4fc2-859e-5c01f12e992d (map)            |     0          0
    ----------------------------------------------------------------------------------------------------
    Total                                                                    |    48      20622

### Snapshot Stats

**--stat:snapshot**

    Blob Path                                                                  | Bytes
    ----------------------------------------------------------------------------------------------------
    !CONTAINER!/.attributes                                                    | 156
    !CONTAINER!/.blobs                                                         | 4
    !CONTAINER!/.gitmodules                                                    | 140
    !CONTAINER!/deltas                                                         | 872
    !CONTAINER!/quorumMembers                                                  | 220
    !CONTAINER!/quorumProposals                                                | 4
    !CONTAINER!/quorumValues                                                   | 184
    [defaultDataStore]/.component                                              | 32
    [defaultDataStore]/0fb26504-369f-4234-ad97-0a303d3ec81f/.attributes        | 64
    [defaultDataStore]/0fb26504-369f-4234-ad97-0a303d3ec81f/header             | 4
    [defaultDataStore]/74577601-3af5-49a1-9ca5-db5d9ee128a8/.attributes        | 72
    [defaultDataStore]/74577601-3af5-49a1-9ca5-db5d9ee128a8/content/header     | 448
    [defaultDataStore]/74577601-3af5-49a1-9ca5-db5d9ee128a8/content/catchupOps | 4
    [defaultDataStore]/74577601-3af5-49a1-9ca5-db5d9ee128a8/header             | 180
    [defaultDataStore]/91ac6df2-dda6-409a-b5e3-be84ce9ab138/.attributes        | 64
    [defaultDataStore]/91ac6df2-dda6-409a-b5e3-be84ce9ab138/header             | 168
    [defaultDataStore]/92ebb388-68a0-4fc2-859e-5c01f12e992d/.attributes        | 64
    [defaultDataStore]/92ebb388-68a0-4fc2-859e-5c01f12e992d/header             | 4
    [defaultDataStore]/root/.attributes                                        | 64
    [defaultDataStore]/root/header                                             | 300
    ----------------------------------------------------------------------------------------------------
    Total snapshot size                                                        | 3048

## Debugging

If you would like to debug fetch-tool, you can create a unit test. Remember to add tsconfig.json and list mocha in devDependencies.

In the unit test, you can use `setArguments()` from fluidFetchArgs to pass in arguments you want to test. Then call the methods you want to run and you will be able to set breakpoints in vscode.

**Example**

```js
describe("fetch tool", () => {
	it("can fetch messages", async () => {
		fluidFetchArgs.setArguments(your_args);
		const documentService = await fluidFetchInit(your_paramURL);
		await fluidFetchMessages(documentService, your_saveDir);
	});
});
```

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
