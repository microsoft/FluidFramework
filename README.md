# Fluid

The Fluid Framework is a TypeScript library for building distributed, real-time collaborative web components and
applications.

## Getting started using the Fluid Framework

You may be here because you want to...

- [Learn more about what Fluid is]()
- [Build a Fluid component]()

All of these are documented at <https://aka.ms/fluid>.

### Coming soon...

* Engage with other Fluid users and developers on [StackOverflow](https://stackoverflow.com/questions/tagged/fluidframework)
* Help each other in the [Fluid Community Discord]() **(community channel not yet created)**
* Join the discussion on Twitter **(hashtag not established yet)**

## Code Structure

The core code is built into several large chunks ("minirepos", managed using [Lerna](https://lerna.js.org/)) which are
versioned separately from one another, but internally all packages in a minirepo are versioned together. And outside the
minirepos there are plenty of packages which are versioned independently.

Here's the breakdown of the repo:

* Fluid Framework Client Minirepo ([lerna.json](./lerna.json))
  * [Packages](./packages)
  * [Example Components](./components/examples)
  * [Experimental Components](./components/experimental)
  * [Example host](./examples/hosts/iframe-host)
* Reference Fluid Ordering Service ("Routerlicious") Minirepo ([dir](./server/routerlicious) | [lerna.json](server/routerlicious/lerna.json))
  * [Packages](./server/routerlicious/packages)
* Common Packages
  * [Common Definitions](./common/lib/common-definitions)
  * [Common Utils](./common/lib/common-utils)
* Auxiliary Microservices supporting Routerlicious
  * [Server dir](./server) (excluding [Routerlicious](./server/routerlicious) itself)
* Internal/Misc Packages
  * [Build Common](./common/build/build-common)
  * [ESlint Config](./common/build/eslint-config-fluid)
  * Other Example Hosts
    * [Electron Host](./examples/hosts/electron-host)
    * [Literate](./examples/hosts/literate)
  * [Docs](./docs)
  * [Tools](./tools)

## Building

In order to build the Fluid Framework, ensure that you have installed [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/).

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

## Testing

You can run the tests from root to run all tests (via lerna), or you can run a scoped set of tests by running the
command from the directory you're interested in.

Note: Some of the tests depend on test collateral that lives in a submodule here:
<https://github.com/microsoft/FluidFrameworkTestData>.  You may choose to fetch that collateral into your local
repository, which is required to run all the tests - otherwise some will be skipped. First install git LFS from
<https://git-lfs.github.com/>. Then, from the repo root:

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

_Note: The official build uses npm run test:full, which doesn’t work on windows._

```shell
npm run test:coverage
npm run test:copyresults
```

### Run tests from within VS Code

We've checked in [VS Code configuration](https://github.com/microsoft/FluidFramework/blob/master/.vscode/launch.json) enabling F5 from a `spec.ts` file to run those tests, if you set the debug configuration to "Debug Current Test".

## Run it locally

### Single browser window, two panes

_This will use an in-memory implementation of the Fluid server to sync between the two panes in the browser window._

* Choose a component under `/components`
* Navigate to the component's directory, e.g. `/components/experimental/clicker`
* `npm run start`
* Browse to <http://localhost:8080> to interact with two copies of the component side-by-side

### Multiple browser instances on the same device

_This will run the local Fluid server implementation we like to call "tinylicious", so you can sync between multiple browser instances._

First, start Tinylicous by running these commands from `/server/tinylicous`:

```shell
npm install
npm run build
npm run start
```

Then:

* Navigate to your component of choice (same as above)
* `npm run start:tinylicious`
* Browse to <http://localhost:8080,> copy the full URL you're redirected to, and open in a second window to collaborate

## Contributing

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/master/CONTRIBUTING.md) to Fluid.

* [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
* Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/master/CONTRIBUTING.md).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see
the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com)
with any additional questions or comments.
