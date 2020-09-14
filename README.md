# Fluid

The Fluid Framework is a TypeScript library for building distributed, real-time collaborative web
applications.

## Getting started using the Fluid Framework

You may be here because you want to...

* Learn more about the Fluid Framework
* Build a Fluid object

Documentation and guides can be found at <https://fluidframework.com/>.

Hello World repo can be found at <https://github.com/microsoft/FluidHelloWorld>.

Core Examples repo can be found at <https://github.com/microsoft/FluidExamples>.

Have questions? Engage with other Fluid Framework users and developers on
[StackOverflow](https://stackoverflow.com/questions/tagged/fluid-framework)

## Code structure

The core code for both the Fluid client packages _and_ the reference ordering service is contained within this repo.

The repo structure is somewhat unique because it contains two monorepos as well as several standalone packages. The
monorepos are managed using [Lerna](https://lerna.js.org/) and are versioned separately from one another, but internally
all packages in a monorepo are versioned together. Outside the monorepos there are plenty of packages which are
versioned independently.

Here's the breakdown of the repo:

* Fluid Framework Client Monorepo ([lerna.json](./lerna.json))
  * [Packages](./packages)
  * [Fluid Examples](./examples)
* Reference Fluid Ordering Service ("Routerlicious") Monorepo ([dir](./server/routerlicious) | [lerna.json](server/routerlicious/lerna.json))
  * [Packages](./server/routerlicious/packages)
* Common Packages
  * [Common Definitions](./common/lib/common-definitions)
  * [Common Utils](./common/lib/common-utils)
* Auxiliary Microservice Packages (supporting Routerlicious)
  * [Server dir](./server) (excluding [Routerlicious](./server/routerlicious) itself)
* Internal/Misc Packages
  * [Build Common](./common/build/build-common)
  * [ESlint Config](./common/build/eslint-config-fluid)
  * [Docs](./docs)
  * [Tools](./tools)

Dependencies between packages in various layers of the system are enforced via a build step called
[layer-check](./tools/build-tools/src/layerCheck). You can view the full list of packages and layers in
[docs/PACKAGES.md](./docs/PACKAGES.md).

## Building

In order to build the Fluid Framework, ensure that you have installed [Git](https://git-scm.com/downloads) and
[Node.js](https://nodejs.org/).

Note: we recommend using nvm (for [Windows](https://github.com/coreybutler/nvm-windows) or
[MacOS/Linux](https://github.com/nvm-sh/nvm)) to install Node.js, in case you find yourself needing to install different
versions of Node.js side-by-side.

Clone a copy of the repo and change to the repo root directory:

```shell
git clone https://github.com/microsoft/FluidFramework.git
cd FluidFramework
```

Run the following to build the client packages:

```shell
npm install
npm run build:fast
```

See also: [Contributing](#Contributing)

## Testing

You can run all of our tests from the root of the repo, or you can run a scoped set of tests by running the `test`
command from the package you're interested in.

Note: Some of the tests depend on test collateral that lives in a submodule here:
<https://github.com/microsoft/FluidFrameworkTestData>.  You may choose to fetch that collateral into your local
repository, which is required to run all the tests - otherwise some will be skipped.

First install Git LFS from <https://git-lfs.github.com/>. Then, from the repo root:

```shell
git lfs install
git submodule init
git submodule update
```

### Run the tests

```shell
npm run test
```

### Include code coverage

```shell
npm run test:coverage
```

### Mimic the official CI build

Our CI pipelines run on Linux machines, and the npm scripts all have the `ci` prefix.
To replicate the test steps from the CI pipeline locally, run the following commands for the packages or Lerna monorepos:

Run      | Non-Windows                | Windows                                               |
---------|----------------------------|-------------------------------------------------------|
PR       | `npm run ci:test`          | `npm run test:report && npm run test:copyresults`     |
Official | `npm run ci:test:coverage` | `npm run test:coverage && npm run test:copyresults`   |

### Run tests from within VS Code

We've checked in [VS Code configuration](https://github.com/microsoft/FluidFramework/blob/main/.vscode/launch.json)
enabling F5 from a `spec.ts` file to run those tests if you set the debug configuration to "Debug Current Test".

## Run it locally

### Single browser window, two panes

_This will use an in-memory implementation of the Fluid server to sync between the two panes in the browser window._

* Choose an example under `/examples`
* Navigate to the example's directory, e.g. `/examples/data-objects/clicker`
* `npm run start`
* Browse to <http://localhost:8080> to interact with two copies of the example side-by-side

### Multiple browser instances on the same device

_This will run the local Fluid server implementation we call "Tinylicious", so you can sync between multiple browser
instances._

First, start Tinylicious by running these commands from `/server/tinylicious`:

```shell
npm install
npm run build
npm run start
```

Then:

* Navigate to the example of your choice (same as above)
* `npm run start:tinylicious`
* Browse to <http://localhost:8080,> copy the full URL you're redirected to, and open in a second window to collaborate

## Contributing

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

* Participate in Q&A on [StackOverflow](https://stackoverflow.com/questions/tagged/fluid-framework)
* [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
* Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the
[Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact
[opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these
trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks). Use of
Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft
sponsorship.
