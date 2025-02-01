# @fluidframework/build-tools

This package contains two tools:

-   `fluid-build`: build task scheduler that support fast incremental build.
-   `fluid-type-test-generator`: generate type compatibility tests

While these tools are built for the Fluid Framework repo, they can be generalized and can apply to other repo as well.
The content and example below will focus on the Fluid Framework repo.

## Running these tools (Command Line)

To use, one can install the package globally or with your package:

-   In Fluid Framework repo, run `pnpm i` in the root, and use the npm scripts that call it (ex: `build:fast`)
-   globally install that specific version of `@fluidframework/build-tools` and call its binaries directly (ex `fluid-build`)

Run it from a locally build copy. First build it in this directory:

```sh
pnpm i
pnpm run build
```

Then either:

-   Direct invocation: Use `node bin/<tool-name>` in this directory or `node build-tools/packages/build-tools/bin/<tool-name>`
    from the Fluid repo root.
-   Symlink package: Use [npm link](https://docs.npmjs.com/cli/v10/commands/npm-link) with this package to override the
    version of it used in the root package (which is the `client` release group, but often used to build other as well).
    This will make scripts like `build:fast` use the linked version.

## `fluid-build`

`fluid-build` is a build task scheduler. It support declarative task and dependencies definition, incremental
detection for a range of tools and multiple workspace (a.k.a. release group) in a repo.

<!-- this list of arguments is duplicated in `build-tools/packages/build-tools/src/fluidBuild/options.ts`
  and they should be updated together -->

```txt
Usage: fluid-build <options> [(<package regexp>|<path>) ...]
    [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
     --all            Operate on all packages/monorepo (default: client monorepo). See also "--server".
  -c --clean          Same as running build script 'clean' on matched packages (all if package regexp is not specified)
  -d --dep            Apply actions (clean/force/rebuild) to matched packages and their dependent packages
     --fix            Auto fix warning from package check if possible
  -f --force          Force build and ignore dependency check on matched packages (all if package regexp is not specified)
  -? --help           Print this message
     --install        Run npm install for all packages/monorepo. This skips a package if node_modules already exists: it can not be used to update in response to changes to the package.json.
  -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
     --reinstall      Same as --uninstall --install.
  -g --releaseGroup   Release group to operate on
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_ if exist, auto detect otherwise)
  -t --task <name>    target to execute (default:build)
     --uninstall      Clean all node_modules. This errors if some node-nodules folders do not exists: if hitting this limitation you can do an install first to work around it.
     --vscode         Output error message to work with default problem matcher in vscode
     --defroot <path> Default root directory of the Fluid repo if auto detect failed (default: env _FLUID_DEFAULT_ROOT_)
     --timer          Measure elapsed time of each step
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
```

Example for Fluid Framework repo:

After cloning a repo, at the root of the repo, you can install dependencies to all the packages:

```sh
fluid-build --install
```

You can start building (incrementally):

```sh
fluid-build             # client packages
fluid-build -g server   # server packages
fluid-build --all       # all packages
```

Building selected packages (and dependent tasks):

```sh
fluid-build packages/dds/map     # Build starting from the package in the packagedir if exist.  (If the path doesn't exist it is tread as an regex to package name)
fluid-build @fluidframework/map  # Build starting from the package @fluidframework/map since it is not an existing path
fluid-build merge                # Build any package that has "merge" in the name
```

Building a selected task:

```sh
fluid-build -t tsc               # only run the task `tsc` (and dependent tasks) in all package of the current release group (client release group at the root)
fluid-build -t build:esnext map  # only run the task `build:esnext` (and dependent tasks) in package that has "map" in the name
```

Clean and rebuild:

```sh
fluid-build --rebuild merge     # clean and build packages matching 'merge' in any repo
fluid-build --clean common      # cleaning packages containing 'common' in any repo
```

### Task and dependency definition

`fluid-build` uses task and dependency definitions to construct a build graph. It is used to determine which task and
the order to run in. The default definitions for packages are located in at the root `fluidBuild.config.cjs` file under the `tasks` property.
This definitions applies to all packages in the repo (but not release group root). Script tasks and dependencies specified in this default definitions
doesn't have to appear on every package and will be ignored if it is not found.

The task definitions is an object with task names as keys, the task dependencies and config to define the action of the task.
For more details, see the definition `TaskDefinitionsOnDisk` in [./src/common/fluidTaskDefinitions.ts](./src/common/fluidTaskDefinitions.ts)

For example:

```js
module.exports = {
   tasks: {
      "build": {
         dependsOn: [ "tsc", "build:test" ]           // Depends on the `tsc` nad `build:esnext` task in the same package
         script: false                                // Don't trigger a npm script
      }
      "tsc": [ "^tsc"],                               // Depends on `tsc` task of all of the dependent packages
                                                      // (if the task exists)
      "build:test": [ "tsc" ],                        // Depends on `tsc` task
      "clean": {
         before: ["*"],                               // If the task "clean" is specified, it runs before all other task
      }
      "prettier": [],                                 // No dependent tasks
   }
}
```

Each package can be augmented the tasks definition by adding task definitions under `fluidBuild.tasks` in `package.json`.

For example:

```jsonc
{
	"fluidBuild": {
		"tasks": {
			"build": ["...", "build:docs", "copy:docs"],
			"tsc": ["...", "typetests:gen"], // Depends on "typetests:gen", including dependencies
			// in default definition (i.e. "^tsc" in the above example)
			"build:test": [
				"@fluidframework/merge-tree#build:test" // Overrides default, depends only on "build:test" task
				// in dependent package "@fluidframework/merge-tree"
			],
			"copy:docs": {
				"after": ["build:docs"] // if "build:docs" is triggered, "copy:docs" only run after it
			},
			"webpack": ["^tsc"] // Depends on `tsc` task of all of the dependent packages
			// (if the task exists)
		}
	}
}
```

When building release group, by default, it will trigger the task on all the packages within the release group. That also mean
that scripts at the release group root are not considered.

Release group root scripts support can be enabled by adding `fluidBuild.tasks` to the release group's `package.json`. `fluid-build`
will follow the definition if specified for the task, or it will trigger the root script if the script doesn't invoke `fluid-build`.
If the script doesn't exist or if it starts with `fluid-build`, then fluid-build will fall back to the default behavior of triggering the task
on all the packages within the release group. There is no support for "global definitions." Task definitions in `fluidBuild.config.cjs` only apply to packages, not release group roots. Release group root scripts must be defined in the `fluidBuild.tasks` section of the root's `package.json`.

### Concurrency

`fluid-build` will run task in parallel based on the dependencies information from the build graph. Task are queued
when all the dependencies are "complete". By default, `fluid-build` will execute up to number of CPU of tasks.
This can be overridden by the `--concurrency` option on the command line.

### Incremental and Tasks

`fluid-build` support for incremental detection to check if a task is already up-to-date and doesn't need to rebuild to
reduce build time. It has different detection based on the command that is activated. See the object definition
`executableToLeafTask` in [./src/fluidBuild/tasks/taskFactory.ts](./src/fluidBuild/tasks/taskFactory.ts) for the full
list of task.

Here are some of the tasks detection mechanism.

#### Tsc Task

For TypeScript compiler (TSC), `fluid-build` makes use of the incremental build info that the compiler already generate
when incremental build option is enabled. While `tsc` also make use of this information to avoid recompilation, `tsc`
still takes longer to detect that when invoked. `fluid-build` bypass that and read the incremental build to get all the
input files it depends on and compare the before and after file hash to check if the input files are changed.

#### Tslint/Eslint/ApiExtractor Task

`tslint`, `eslint` and `api-extractor` are all "tsc-dependent" tasks, and have similar incremental rules. It will
detect whether the task needs to run based on any `tsc` dependent task declared in the build graph (filtered to
within the package if possible). It then copy the content of the `tsc` build info of these dependent task along with the
the version and config for `tslint`, `eslint` and `api-extractor` and generate a "done" file. Compare the content of
the current state and previous build will determine whether the task needs to be invoked.

### Worker mode (Experimental)

In worker mode using the option `--worker`, `fluid-build` will create worker processes reuse it to run some of the tools
instead of spawning new processes. This can speed up the build around ~29%.

Worker mode is in experimental currently and not on by default. One drawback is that the worker processes would start
accumulating memory, growing to multiple GB in size, and dev environment with limited memory may adversely affected.

## Release Group definition

Release group are basically group of packages managed by a workspace. `fluid-build` support multiple release group and
independent packages within the same repo. The repo structure is specified in `fluidBuild.config.cjs` at the root of
the repo under `repoPackages` property. See [fluidBuild.config.cjs](../../../fluidBuild.config.cjs) for how it looks
like.

## Debug Traces

`fluid-build` using the `debug` package to do traces for investigating and diagnosing problem. Below are some of the trace
names `fluid-build` uses.

### fluid-build:init

Trace the initialization of `fluid-build`, including root directory inference, package loading and selection (based on command line
scopes).

### fluid-build:task:definition

Used to debug the logic that combines task and dependency definitions from the default in `fluidBuild.config.cjs` at the root
of the
repo and the local package's `package.json`. It will dump the full combined definition for each package.

### fluid-build:task:init\*

These traces show the tasks and relationships in the build graph to diagnose task dependency and ordering problems.
Debugging traces can be enabled for individual steps or for all of them.

-   `fluid-build:task:init` - Trace the task that are created, to show what task is included
-   `fluid-build:task:init:defdep` - Trace the task dependencies derived from expanding and resolving task definitions
-   `fluid-build:task:init:dep` - Trace full build graph of leaf tasks (a single command invocation)
-   `fluid-build:task:init:weight` - Weight assigned to each task (where higher weight is prioritized to run first)

### fluid-build:task:trigger

Trace the reasons why each task is triggered. Useful to diagnose problems with incremental build.

### fluid-build:task:exec\*

These traces show the execution flow of the task, to show the task invocation in action.

-   `fluid-build:task:exec` - Trace whether the task is skipped or, if it runs, the start and finish of the task
-   `fluid-build:task:queue` - Trace when the task is queued after the dependent tasks are done
-   `fluid-build:task:exec:wait` - Trace the wait time of a task in queue (the delay in execution after it is ready to be scheduled)

### Other fluid-build:\* traces

-   `fluid-build:task:error` - Trace of detailed error messages on any operation in a task
