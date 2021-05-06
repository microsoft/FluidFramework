# @fluidframework/build-tools

This package contains scripts and tools for Fluid Framework repo maintenance.  The main tool is `fluid-build` which is a node script written specifically for building the Fluid Framework packages and mono repo. While repo is set up officially to support building with lerna, this script tries to use the information to speed up build time by maximizing concurrent task and incremental build.

NOTE: There is a lot of assumption made in the tool about the commands parsing and dependencies and structure of the mono repo.  If these assumption changes, this tool will break and needs to be fixed up.  More work can be done to the tool to do it more formally and correctly.  But it should work for our current repo.

`fluid-layer-check` is a tool to make sure the dependencies between Fluid Framework packages are properly layered.  It also can be used to generate .dot file to generate a visual graph using GraphViz.

## Setup

In this directory:

```sh
npm i
npm run build
npm link
```

## Running `fluid-build` (Command Line)

```txt
Usage: fluid-build <options> [<npm script>] [<package regexp> ...]
  [<npm script>]         Name of the npm script to run (default: build)
  [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
     --all            Operate on all packages/monorepo (default: client monorepo)
  -c --clean          Same as running build script 'clean' on matched packages (all if package regexp is not specified)
  -d --dep            Apply actions (clean/force/rebuild) to matched packages and their dependent packages
  -f --force          Force build and ignore dependency check on matched packages (all if package regexp is not specified)
  -? --help           Print this message
     --install        Run npm install for all packages/monorepo
  -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
     --reinstall      Same as --uninstall --install
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
  -s --script <name>  npm script to execute (default:build)
     --server         Operate on the server monorepo
     --symlink        Fix symlink between packages within monorepo (isolate mode)
     --symlink:full   Fix symlink between packages across monorepo (full mode)
     --uninstall      Clean all node_modules
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

Symlink commands to change the symlink to either limit to single monorepo, or cross monorepo

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

```txt
Usage: fluid-layer-check <options>
Options:
     --dot <path>     Generate *.dot for GraphViz
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

It make use of the dependencies in the package.json to build the dependency graph.  It recognizes (crudely) the break apart of the tasks with in the build script, and make certain assumption to create dependency between those individual task. These task are then queued and schedule based on this dependency to increase the level of concurrent tasks it can run.  (In contrast to running it thru lerna, you get package level concurrency)

### Incremental and Tasks

The script recognized tasks in the Fluid package and has logic to detect whether a task need to be built.

#### Tsc Task

For TypeScript compiler (TSC), it makes use of the incremental build info to tell us all the files it depends on and the file hash to check if the input files are changed.
While tsc make use of this information to avoid recompilation, tsc still takes a while for unknown reason.

Currently, this task recognize whether it is the default tsc build to commonjs modules, or for esnext modules for webpacking.  Since the type definition should be the same for both, both will only wait for only the default tsc build from it's package dependencies, and not wait fo esnext one, so that we can get more concurrency

#### Tslint/Eslint Task

Tslint task only wait for the type definition from it's package dependencies.

## Note about `fluid-bump-version`

This tool assumes that you have a set a remote git ref to `microsoft/FluidFramework`. Note that this ref must be an HTTPS URL - if you are using an SSH ref and get an error saying that a remote cannot be found for the repo, then make sure you add another ref specifically for the HTTPS URL (even if you do not use it otherwise).
