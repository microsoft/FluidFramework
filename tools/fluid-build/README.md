# Fluid Build script

This is a node script written specifically for building the Fluid Framework mono repo. While repo is set up officially to support building with lerna, this script tries to use the information to speed up build time by maximizing concurrent task and incremental build.

NOTE: There is a lot of assumption made in the tool about the commands parsing and dependencies and structure of the mono repo.  If these assumption changes, this tool will break and needs to be fixed up.  More work can be done to the tool to do it more formally and correctly.  But it should work for our current repo.

## Setup

In this directory:

```sh
npm i
npm run build
npm link
```

## Running the tool (Command Line)

```sh
Usage: fluid-build <options> [<npm script>] [<package regexp> ...]
  [<npm script>]         Name of the npm script to run (default: build)
  [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
  -c --clean             Same as running build script 'clean'
  -? --help              Print this message
     --logtime           Display the current time on every status message for logging
  -r --rebuild           Clean and build
     --root              Root directory of the fluid repo (default: env _FLUID_ROOT_)
     --timer             Time separate phases
  -v --verbose           Verbose messages
```

Example:

Build (incrementally):

```sh
fluid-build
```

Rebuild (clean and build) any package name matching "merge" and it's dependencies

```sh
fluid-build --rebuild merge
```

## Running the tool (Fluid directory workspace in VSCode)

To build fluid within VSCode, use Ctrl-Shift-B to break up the build task list and choose `fluid-build`.

## Details

### Concurrency

It make use of the dependencies in the package.json to build the dependency graph.  It recognizes (crudely) the break apart of the tasks with in the build script, and make certain assumption to create dependency between those individual task. These task are then queued and schedule based on this dependency to increase the level of concurrent tasks it can run.  (In contrast to running it thru lerna, you get package level concurrency)

### Incremental

The script recognized tasks in the fluid package and has logic to detect whether a task need to be built.

#### Tsc Task

For TypeScript compiler (TSC), it makes use of the incremental build info to tell us all the files it depends on and the file hash to check if the input files are changed.
While tsc make use of this information to avoid recompilation, tsc still takes a while for unknown reason.

Currently, this task recognize whether it is the default tsc build to commonjs modules, or for esnext modules for webpacking.  Since the type definition should be the same for both, both will only wait for only the default tsc build from it's package dependencies, and not wait fo esnext one, so that we can get more concurrency

#### Tslint Task

Tslint task only wait for the type definition from it's package dependencies.
