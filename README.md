# Fluid

We built Fluid to make it simpler for developers to build real-time collaborative experiences using Web technology.

Fluid powers distributed, modular, collaborative applications by providing developers with eventually consistent [distributed
data structures](./docs/guide/dds.md), a flexible component and app model, and a simple, scalable server architecture.

Teams are using Fluid for low latency collaboration, zero setup data persistance, and on-by-default cross app
compatibility. Among other projects, our partner teams are building components for text editing, gaming, command line
tooling, and IoT.

Fluid's [distributed data structures](./guide/dds.md) make it easy to write apps that are collaborative just like you
would build single-user applications and experiences. Fluid handles keeping your data in sync across multiple clients,
so you can focus on your app's business logic. Fluid's data synchronization is fast, efficient, and requires very little
bandwidth. Fluid is extensible, too. You can write components which can be re-used or you can even create new
distributed data structures.

## Installing

_Coming soon._

## Contribute

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/master/CONTRIBUTING.md) to Fluid.

* [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
* Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/master/CONTRIBUTING.md).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see
the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com)
with any additional questions or comments.

### Coming soon...

* Engage with other Fluid users and developers on [StackOverflow](https://stackoverflow.microsoft.com/questions/tagged/fluid) **(currently Msft internal only)**
* Help each other in the [Fluid Community Discord]() **(community channel not yet created)**
* Join the discussion on Twitter **(hashtag not established yet)**

## Documentation

Get up and running quickly using our documentation at <https://aka.ms/fluid>.

## Building

In order to build the Fluid Framework, ensure that you have installed [Git](https://git-scm.com/downloads) and **v10** of [Node.js](https://nodejs.org/).

> Fluid Framework's toolchain has a known issue with Node versions later than v10.  The latest v10 release can be found [here](https://nodejs.org/dist/latest-v10.x/).
>
> _You may want to use nvm (for [Windows](https://github.com/coreybutler/nvm-windows) or [MacOS/Linux](https://github.com/nvm-sh/nvm)) to install v10 side-by-side with later versions of Node.js._

Clone a copy of the repo and change to the repo root directory:

```bash
git clone https://github.com/microsoft/FluidFramework.git
cd FluidFramework
```

Run the following to build the client packages:

```bash
npm install
npm run build:fast
```

## Testing

### Pre-requisite: Downloading test collateral

Some of the test collateral is in a submodule here: <https://github.com/microsoft/FluidFrameworkTestData>.  You'll need to fetch that collateral into your enlistment to successfully run all the tests.

First install git LFS from <https://git-lfs.github.com/>. Then, from the repo root:

```bash
git lfs install
git submodule init
git submodule update
```

### Running the tests

You can run the tests from root to run all tests (via lerna), or you can run a scoped set of tests by running the command from the directory you're interested in.

#### Unit Tests

```bash
npm run test
```

#### UTs with code coverage

```bash
npm run test:coverage
```

#### Mimicking the official CI build

_Note: The official build uses npm run test:full, which doesn’t work on windows._

```bash
npm run test:coverage
npm run test:copyresults
```

#### From within VS Code

We've checked in [VS Code configuration](https://github.com/microsoft/FluidFramework/blob/master/.vscode/launch.json) enabling F5 from a `spec.ts` file to run those tests.

## Try it out locally

### Single browser window, two panes

_This will use an in-memory implementation of the Fluid Server to sync between the two panes in the browser window._

* Choose a component under `/examples/components/`
* Navigate to the component's directory, e.g. `/examples/components/clicker`
* `npm run start`
* Browse to <http://localhost:8080> to interact with two copies of the component side-by-side

### Multiple browser instances on the same device

_This will run the local Fluid Server implementation we like to call "tinylicious", so you can sync between multiple browser instances._

First, start Tinylicous by running these commands from `server/tinylicous`:

```bash
npm install
npm run build
npm run start
```

Then:

* Navigate to your component of choice (same as above)
* `npm run start:tinylicious`
* Browse to <http://localhost:8080,> copy the full URL you're redirected to, and open in a second window to collaborate
