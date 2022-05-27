# @fluidframework/build-tools

This package contains scripts and tools for Fluid Framework repo maintenance.
The main tool is `fluid-build` which is a node script written specifically for building the Fluid Framework packages.
A couple subsets of packages can be build with lerna, but this script unifies all the lerna managed package collections and the standalone packages (not using lerna).
In addition to providing a single entry point for all the packages, fluid-build uses some hardcoded knowledge of the fluid-framework structure as well as information from the package files to speed up build time by maximizing concurrent task and incremental build.

NOTE: There is a lot of assumption made in the tool about the commands parsing and dependencies and structure of the mono repo.
If these assumption changes, this tool will break and needs to be fixed up.
More work can be done to the tool to do it more formally and correctly.
But it should work for our current repo.

`fluid-layer-check` is a tool to make sure the dependencies between Fluid Framework packages are properly layered.  It also can be used to generate .dot file to generate a visual graph using GraphViz.

## Setup

In this directory:

```sh
npm i
npm run build
```

## Running these tools (Command Line)

This package produces several binaries, see `bin` in package.json.

This repo is normally build using the version of this package referenced by the root package.json file.
To run that version, just do one of:
- `npm i` in the root, and use the npm scripts that call it (ex: `build:fast`)
- globally install that specific version of `@fluidframework/build-tools` and call its binaries directly (ex `fluid-build`)

There are several also ways to use the local version of `@fluidframework/build-tools` from within the repo.
Just build it (as in "Setup") then do one of:
* Use [npm link](https://docs.npmjs.com/cli/v8/commands/npm-link) with this package to override the version of it used in the root package (which is the `client` lerna package, but often used to build other as well). This will make scripts like `build:fast` use the linked version.
* use `node bin/tool-name` in this directory or `node tools/build-tools/bin/fluid-build tool-name` from the root.

You can also use `npx --package "@fluidframework/build-tools" tool-name`, but exactly how versioning on this works and how it can be specified depends on the npm version and isn't super clear.

Using `fluid-build`'s `--symlink:full` does **NOT** symlink the version of build tools in the repo into the root package: the root package will still use the published build-tools package.

<!-- this list of arguments is duplicated in `src/common/commonOptions.ts` and they should be updated together -->

All the tools take some common options:
```
     --defroot <path> Default root directory of the Fluid repo if infer failed (default: env _FLUID_DEFAULT_ROOT_)
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
     --timer          Measure elapsed time of each step
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
```

## Running `fluid-build` (Command Line)

This package produces several binaries, see `bin` in package.json.
You can globally install this package to run them.
To run the version of them you built in "Setup" above, run `node bin/tool-name`.
Note that this correctly detects the fluid-framework directory when from elsewhere, for example it works just fine in the repository root with `node tools/build-tools/bin/fluid-build fluid-build`.

One of these is tools is `fluid-build`:

<!-- this list of arguments is duplicated in `src/fluidBuild/options.ts` and they should be updated together -->

```txt
Usage: fluid-build <options> [(<package regexp>|<path>) ...]
    [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
     --all            Operate on all packages/monorepo (default: client monorepo). See also `--server`.
  -c --clean          Same as running build script 'clean' on matched packages (all if package regexp is not specified)
  -d --dep            Apply actions (clean/force/rebuild) to matched packages and their dependent packages
     --fix            Auto fix warning from package check if possible
  -f --force          Force build and ignore dependency check on matched packages (all if package regexp is not specified)
  -? --help           Print this message
     --install        Run npm install for all packages/monorepo. This skips a package if node_modules already exists: it can not be used to update in response to changes to the package.json.
  -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
     --reinstall      Same as --uninstall --install.
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
  -s --script <name>  npm script to execute (default:build)
     --azure          Operate on the azure monorepo (default: client monorepo). Overridden by `--all`
     --server         Operate on the server monorepo (default: client monorepo). Overridden by `--all`
     --symlink        Fix symlink between packages within monorepo (isolate mode). This configures the symlinks to only connect within each lerna managed group of packages. This is the configuration tested by CI and should be kept working.
     --symlink:full   Fix symlink between packages across monorepo (full mode). This symlinks more things in the repo together: exactly what additional things it links is unclear, but it is not everything. CI does not ensure this configuration is functional, so it may or may not work.
     --uninstall      Clean all node_modules. This errors if some node-nodules folders do not exists: if hitting this limitation you can do an install first to work around it.
     --vscode         Output error message to work with default problem matcher in vscode
     --defroot <path> Default root directory of the Fluid repo if infer failed (default: env _FLUID_DEFAULT_ROOT_)
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
     --timer          Measure elapsed time of each step
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
```

Example:

After cloning a repo, you can install dependencies to all the packages:

```sh
fluid-build --install
```

You can then start building (incrementally):

```sh
fluid-build             # client packages
fluid-build --server    # server packages
fluid-build --all       # all packages
```

Clean and rebuild:

```sh
fluid-build --rebuild merge     # clean and build packages matching 'merge' in any repo
fluid-build --clean common      # cleaning packages containing 'common' in any repo
```

Symlink commands to change the symlink to either limit to single monorepo (collection of packages managed by lerna), or cross monorepo

```sh
fluid-build --symlink:full    # switch to full link mode (cross monorepos)
fluid-build                   # build
```

```sh
fluid-build --symlink         # switch to isolate link mode (within monorepo)
fluid-build                   # build
```

Note that --symlink* changes any symlink, the tool will run the clean script for all the packages to make sure everything rebuilt every the next time.

## Running `fluid-build` (Fluid directory workspace in VSCode)

To build Fluid within VSCode, use Ctrl-Shift-B to break up the build task list and choose `fluid-build`.

## Running `fluid-layer-check` (Command Line)

<!-- this list of arguments is duplicated in `tools/build-tools/src/fluidBuild/options.ts` and they should be updated together -->

```txt
Usage: fluid-layer-check <options>
Options:
     --dot <path>     Generate *.dot for GraphViz
     --info <path>    Path to the layer graph json file
     --md [<path>]    Generate PACKAGES.md file for human consumption at path relative to repo root (default: repo root)
     --defroot <path> Default root directory of the Fluid repo if infer failed (default: env _FLUID_DEFAULT_ROOT_)
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
     --timer          Measure elapsed time of each step
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
```

By default, without any options, fluid-layer-check checks the dependencies in Fluid Framework packages are layered properly and warn about if they are not. The property layering is defined in `data/layerInfo.json` file.

With --dot &lt;path&gt; argument, it will generate the dependency graph in the [dot](https://graphviz.gitlab.io/_pages/doc/info/lang.html) format and [GraphViz](https://graphviz.org/) can be used to generate visual representation of our packages.

## Details `fluid-build`

### Concurrency

It make use of the dependencies in the package.json to build the dependency graph.  It recognizes (crudely) the break apart of the tasks with in the build script, and make certain assumption to create dependency between those individual task. These task are then queued and schedule based on this dependency to increase the level of concurrent tasks it can run.

Lerna will also automatically parallelize based on package dependencies (unless (--no-sort)[https://github.com/lerna/lerna/tree/main/core/global-options#--no-sort] is provided). This functionality of lerna is not used and instead `fluid-build` implements its own parallelization scheme.

### Incremental and Tasks

The script recognized tasks in the Fluid package and has logic to detect whether a task need to be built.

Note that `fluid-build --install` looks for the presence of `node_modules` and thus does not respond to changes to package.json.
The actual build tasks do check package.json for changes, but will not initiate a npm install.

#### Tsc Task

For TypeScript compiler (TSC), it makes use of the incremental build info to tell us all the files it depends on and the file hash to check if the input files are changed.
While tsc make use of this information to avoid recompilation, tsc still takes a while for unknown reason.

Currently, this task recognize whether it is the default tsc build to commonjs modules, or for esnext modules for webpacking.  Since the type definition should be the same for both, both will only wait for only the default tsc build from it's package dependencies, and not wait fo esnext one, so that we can get more concurrency.

#### Tslint/Eslint Task

Tslint task only wait for the type definition from it's package dependencies.

## Note about `fluid-bump-version`

This tool assumes that you have a set a remote git ref to `microsoft/FluidFramework`. Note that this ref must be an HTTPS URL - if you are using an SSH ref and get an error saying that a remote cannot be found for the repo, then make sure you add another ref specifically for the HTTPS URL (even if you do not use it otherwise).
