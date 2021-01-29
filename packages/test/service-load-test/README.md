# @fluid-internal/service-load-test

_Note: This tool has dependencies on Microsoft-internal systems._

NodeJs-based test to simulate many clients and a high rate of op generation.

## Pre-requisites

* Run [getkeys](/tools/getkeys/README.md) to enable your machine to retrieve OAuth tokens

## Usage

This test runs in two different modes: Orchestrator Mode and Test Runner mode

### Orchestrator Mode

_This is the main entry point to the test - this Orchestrator process will spawn many Test Runner processes._

```bash
node ./dist/nodeStressTest.js --password <password> [--url <url>] [--profile <profile>] [--debug]
```

### Test Runner Mode

_This is not typically invoked manually - rather, the Orchestrator process spawns Test Runners using this mode._

```bash
node ./dist/nodeStressTest.js --runId <runId> --password <password> --url <url> [--profile <profile>]
```

### npm scripts

There are several npm scripts in [package.json](./package.json) to make it quicker to launch this tool. Among others:
`npm run start` - Launches in Orchestrator Mode with default options
`npm run debug` - Launches in Orchestrator Mode with `--debug` provided to allow for attaching to child test runners.

### Options

#### --password, -w

The password for the username provided in testconfig.json, to be used to retrieve auth tokens. Always required.

#### --url, -u

If present, the test will load an existing data store (at the given url) rather than creating a new container and data store.
(Required when `--runId` is provided)

#### --profile, -p

Specifies which test profile to use from [testConfig.json](./testConfig.json). Defaults to **full**.

#### --runId, -r

If present, launch in Test Runner mode with the given runId (to distinguish from other concurrent test runners).
`--url` is required, since the test runner needs to know which data store to connect to.

#### --driveId, -di

If present, the test will use this driveId instead automatically determining it. This is used internally when in orchestrator mode.

#### --debug, -d

Launches each test runner with `--inspect-brk` and a unique Node debugging port. (Not compatible with `--runId`)

#### --log, -l

Overrides DEBUG environment variable for telemetry logging to console. If DEBUG env variable is unset and this is not provided, only errors will print. The value passed here should be a filter string for the logger namespace.

>To print all messages, provide `--log '*'` or `--log 'fluid:*'`. For example, to filter to only Container logs, provide something like: `-l 'fluid:telemetry:Container:*'`.
