# Fluid

The Fluid Framework is a library for building distributed, real-time collaborative web
applications using JavaScript or TypeScript.

## Getting started using the Fluid Framework

You may be here because you want to...

-   Learn more about the Fluid Framework
-   Build a Fluid object

Documentation and guides can be found at <https://fluidframework.com/>.

Hello World repo can be found at <https://github.com/microsoft/FluidHelloWorld>.

Core Examples repo can be found at <https://github.com/microsoft/FluidExamples>.

Have questions? Engage with other Fluid Framework users and developers in the [Discussions](https://github.com/microsoft/FluidFramework/discussions) section of our GitHub repo.

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

## Code structure

The core code for both the Fluid client packages _and_ the reference ordering service is contained within this repo.

The repo structure is somewhat unique because it contains several [pnpm workspaces](https://pnpm.io/workspaces):
some for individual packages and some for larger collections which we call "release groups".
The workspaces are versioned separately from one another, but internally all packages in a workspaces are versioned together.

These workspaces do not align with package namespaces, and also don't always correspond to a single directory of this repo.

Here's the list of release group workspaces:

-   client (previously known as "Fluid Framework Client" or "core") (Rooted in [./](./). Configured by [./pnpm-workspace.yaml](./pnpm-workspace.yaml))
    -   [./packages](./packages) (Published in the `@fluidframework/` namespace, but some in `@fluid-tools` and unpublished packages in `@fluid-internal/`)
    -   [./experimental](./experimental) (Published in the `@fluid-experimental/` namespace)
    -   [./examples](./examples) (Not published, live in the `@fluid-example/` namespace)
    -   [./azure](./azure). (Published in the `@fluidframework/` namespace)
-   routerlicious (Reference Fluid Ordering Service) (Rooted in [./server/routerlicious](./server/routerlicious). Configured by [./server/routerlicious/lerna.json](server/routerlicious/lerna.json))
    -   [Packages](./server/routerlicious/packages) (Published in the `@fluidframework/` namespace)
-   gitrest (Rooted in [./server/gitrest](./server/gitrest). Configured by [./server/gitrest/lerna.json](./server/gitrest/lerna.json))
    -   [Packages](./server/gitrest/packages) (Published in the `@fluidframework/` namespace)
-   historian (Rooted in [./server/historian](./server/historian). Configured by [./server/historian/lerna.json](./server/historian/lerna.json))
    -   [Packages](./server/historian/packages) (Published in the `@fluidframework/` namespace)
-   build-tools (Rooted in [./build-tools](./build-tools). Configured by [./build-tools/lerna.json](./build-tools/lerna.json))
    -   [Packages](./build-tools/packages) (Published in a mix of `@fluidframework/` and `@fluid-tools/` namespaces)

Here's a list of other sets of other packages (each package within these groups is versioned independently,
forming its own release group):

-   "Common" Packages: miscellaneous packages in the [./common](./common) directory and published under the `@fluidframework/` namespace. Most of these (but not all) have "common" in their package name.
    Packages which are used by multiple other groups of packages (such as built tools, linter configs and protocol definitions) live here.
-   "Tools" Packages: miscellaneous packages in the [./tools](./tools) directory and published under a variety of namespaces.
    Logically about the same as "Common", but most of the names include "tools" instead of "common".
-   Auxiliary Microservice Packages (supporting Routerlicious)
    -   [./server](./server) excluding routerlicious, gitrest and historian (Published in the `@fluidframework/` namespace)
-   [./docs](./docs): The code and content for <https://fluidframework.com>.

Dependencies between packages in various layers of the system are enforced via a build step called
[layer-check](./build-tools/packages/build-tools/src/layerCheck). You can view the full list of packages and layers in
[PACKAGES.md](./PACKAGES.md).

## Setup and Building

Install the required tools:

-   [Git](https://git-scm.com/downloads).
    -   \+ [Git LFS](https://git-lfs.com/)
-   [Node.js](https://nodejs.org/): install the version noted in in the [.nvmrc file](./.nvmrc).
    See [NodeJs Installation](#NodeJs-Installation) for details.

Clone a copy of the repo and change to the repo root directory:

```shell
git clone https://github.com/microsoft/FluidFramework.git
cd FluidFramework
```

Enable NodeJs's [corepack](https://github.com/nodejs/corepack/blob/main/README.md):

```shell
corepack enable
```

Run the following to build the client packages:

```shell
pnpm install
npm run build:fast
```

See also: [Contributing](#Contributing)

## NodeJs Installation

We recommend using nvm (for [Windows](https://github.com/coreybutler/nvm-windows) or
[MacOS/Linux](https://github.com/nvm-sh/nvm)) or [fnm](https://github.com/Schniz/fnm) to install Node.js.
This ensures you stay at the correct version while allowing other uses of NodeJS to use the (possibly different) versions they need side-by-side.

Because of a transitive dependency on a native addon module, you'll also need to ensure that you have the prerequisites for `node-gyp`.
Depending on your operating system, you'll have slightly different installation requirements (these are largely copied from `node-gyp`'s [documentation](https://github.com/nodejs/node-gyp#readme)):

### On Windows

The node installer should ask if you want to install "Tools for Native Modules." If you check the box for this nothing further should be needed. Otherwise, you can follow the steps listed [here](https://github.com/Microsoft/nodejs-guidelines/blob/master/windows-environment.md#prerequisites)

### On Unix

1. Python v3.7, v3.8, v3.9, or v3.10
2. `make`
3. A C/C++ toolchain (like [GCC](https://gcc.gnu.org/))

### On MacOS

If you've _upgraded_ your Mac to Catalina or higher, you may need to follow [these](https://github.com/nodejs/node-gyp/blob/main/macOS_Catalina.md) instructions.

1. Python v3.7, v3.8, v3.9, or v3.10
2. `XCode Command Line Tools`, which will install `make`, `clang`, and `clang++`
    - You can install these by running `xcode-select --install` from a command line.

### Other Build Requirements

-   Building [server/Routerlicious](./server/routerlicious/README.md)
    -   Refer to that package's README for additional requirements.
    -   Note that these requirements do not affect all workflows (e.g. the one noted [above](#building)), but will affect workflows that include the packages under `server` (e.g. `fluid-build --symlink:full`).

#### On Windows

-   Ensure that you have enabled running Powershell scripts by setting your environment's [Execution Policy](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-executionpolicy?view=powershell-7.2).

## Testing

You can run all of our tests from the root of the repo, or you can run a scoped set of tests by running the `test`
command from the package you're interested in.

Note: Some of the tests depend on test collateral that lives in a submodule here:
<https://github.com/microsoft/FluidFrameworkTestData>. You may choose to fetch that collateral into your local
repository, which is required to run all the tests - otherwise some will be skipped.

First, ensure you have installed [Git LFS](https://git-lfs.com/).
Then, from the repo root:

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
To replicate the test steps from the CI pipeline locally, run the following commands for the packages or pnpm workspaces:

| Run      | Non-Windows                | Windows                                             |
| -------- | -------------------------- | --------------------------------------------------- |
| PR       | `npm run ci:test`          | `npm run test:report && npm run test:copyresults`   |
| Official | `npm run ci:test:coverage` | `npm run test:coverage && npm run test:copyresults` |

### Run tests from within VS Code

We've checked in [VS Code configuration](https://github.com/microsoft/FluidFramework/blob/main/.vscode/launch.json)
enabling F5 from a `spec.ts` file to run those tests if you set the debug configuration to "Debug Current Test".

## Run it locally

### Single browser window, two panes

_This will use an in-memory implementation of the Fluid server to sync between the two panes in the browser window._

-   Choose an example under `/examples`
-   Navigate to the example's directory, e.g. `/examples/data-objects/clicker`
-   `npm run start`
-   Browse to <http://localhost:8080> to interact with two copies of the example side-by-side

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

-   Navigate to the example of your choice (same as above)
-   `npm run start:tinylicious`
-   Browse to <http://localhost:8080,> copy the full URL you're redirected to, and open in a second window to collaborate

## Tools

### Prettier

This repository uses [prettier](https://prettier.io/) as its code formatter.
Right now, this is implemented on a per-package basis, with a [shared base configuration](./common/build/build-common/prettier.config.cjs).

-   To run `prettier` on your code, run `npm run format` from the appropriate package or release group, or run
    `npm run format:changed` from the root of the repo to format only files changed since the main branch.
    If your change is for the next branch instead, you can run `npm run format:changed:next`.
-   To run `prettier` with [fluid-build](./build-tools/packages/build-tools/README.md), you can specify "format" via the
    script argument: `fluid-build -t format` or `npm run build:fast -- -t format`

To ensure our formatting remains consistent, we run a formatting check as a part of each package's `lint` script.

#### VSCode Options

Our [workspace configuration](./.vscode/settings.json) specifies `prettier` as the default formatter.
Please do not change this.

It is not configured to do any formatting automatically, however.
This is intentional, to ensure that each developer can work formatting into their workflow as they see fit.
If you wish to configure your setup to format on save/paste/etc., please feel free to update your [user preferences](https://code.visualstudio.com/docs/getstarted/settings) to do so.

Notable setting options:

-   `format on save`
-   `format on paste`

<img src="https://user-images.githubusercontent.com/54606601/217620203-0cb07007-0aaa-4e57-bc83-973ed4a3f2d7.png" alt="User editor formatting setting options" style="height:400px;"/>

### Git Configuration

Run the following command in each of your repositories to ignore formatting changes in git blame commands: `git config --local blame.ignoreRevsFile .git-blame-ignore-revs`

## Developer notes

### Root dependencies

The root package.json in the repo includes devDependencies on the mocha and jest testing tools. This is to enable easier
test running and debugging using VSCode. However, this makes it possible for projects to have a 'phantom dependency' on
these tools. That is, because mocha/jest is always available in the root, projects in the repo will be able to find
mocha/jest even if they don't express a dependency on those packages in their package.json. We have lint rules in place
to prevent phantom dependencies from being introduced but they're not foolproof.

## Contributing

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
