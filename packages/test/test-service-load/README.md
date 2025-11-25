# @fluid-internal/test-service-load

_Note: This tool has dependencies on Microsoft-internal systems._

NodeJs-based test to simulate many clients and a high rate of op generation.

## Pre-requisites

-   Run [getkeys](/tools/getkeys/README.md) at some point to enable your machine to retrieve required OAuth tokens and passwords.
    _You do not need to run it more than once, it will persist the keys for future sessions._
-   If you are using a username not already present in `testConfig.json`,
    then you'll need to add the password to the `login__odsp__test__accounts` environment variable. The format is simple:

```json
{"user@foo.com": "pwd_foo", "user@bar.com": "pwd_bar", ...}
```

If you intend to check in the new username, please reach out to someone on the team who can add the creds to Azure Key Vault.

## Usage

This package runs in two different modes: Orchestrator Mode and Test Runner mode

### Orchestrator Mode

_This is the main entry point to the test - this Orchestrator process will spawn many Test Runner processes._

```bash
node ./dist/main.js [--url <url>] [--tenant <tenant>] [--profile <profile>] [--debug] [--log <filterTerm>]
```

### Test Runner Mode

_This is not typically invoked manually - rather, the Orchestrator process spawns Test Runners using this mode._
_See the call to `child_process.spawn` in the source code to refer to arguments used to launch in this mode_

### npm scripts

There are several npm scripts in [package.json](./package.json) to make it quicker to launch this tool. Among others:
`npm run start` - Launches in Orchestrator Mode with default options
`npm run debug` - Debugs in Orchestrator Mode with `--debug` provided to allow for attaching to child test runners.

### URL

When running the stress tests, there will be a URL printed in console, after the line "Connecting to new Container targeting with url:".
This URL can be passed as-is to Fluid Debugger as well as fetch-tool.

### Options

#### --driver, -d

Specifies which test driver to use: odsp, routerlicious, tinylicious. The config for the drivers is pulled from the environment. See [Test Driver](../test-drivers/README.md).

#### --driverEndpoint, -e

Specifies which endpoint of test driver to use: `odsp`, `odsp-df` for `odsp-driver` or `frs` (for Azure Fluid Relay), `r11s`, `docker` for `routerlicious-driver`.

#### --profile, -p

Specifies which test profile to use from [testConfig.json](./testConfig.json). Defaults to **ci**.

#### --testId, -id

If present, the test will load an existing data store for the given test id rather than creating a new container and data store.
(Required when `--runId` is provided)

#### --runId, -r

If present, launch in Test Runner mode with the given runId (to distinguish from other concurrent test runners).
`--url` is required, since the test runner needs to know which data store to connect to.

#### --debug, -dbg

Launches each test runner with `--inspect-brk` and a unique Node debugging port. (Not compatible with `--runId`)

#### --createTestId

If the `testId` argument is specified, the `createTestId` flag determines whether to load an existing
document corresponding to the `testId` specified, or create a new one. When `createTestId` is set to true,
a new document is created, and when `createTestId` is false, we try to load an existing document.

#### --log, -l

Overrides DEBUG environment variable for telemetry logging to console.
If DEBUG env variable is unset and this is not provided, only errors will print.
The value passed here should be a filter string for the logger namespace.

> To print all messages, provide `--log '*'` or `--log 'fluid:*'`. For example, to filter to only Container logs,
> provide something like: `-l 'fluid:telemetry:Container:*'`.

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
