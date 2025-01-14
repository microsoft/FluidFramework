---
marp: true
theme: gaia

---
<style>
  :root {
    --color-background: #fff;
    --color-foreground: #333;
    --color-highlight: #f96;
    --color-dimmed: #888;
  }
</style>

<!-- _class: lead -->

# fluid-build

## Why we use it, how it works and how to improve it

Tyler Butler
tylerbu@microsoft.com

July 30 2024

---

<!-- _class: lead -->

# beware

This presentation contains **opinion**.
It employs **hyperbole**
for both **humor**
and **effect**.

---

# Brief build system theory

## Two primary functions

1. Ordering/scheduling build tasks correctly and efficiently
2. Enabling incremental builds

---

# Incremental builds

Support for incremental builds can be done with all build systems, but it's easier with task and artifact-based systems

An incremental build system is one that enables a part of the build to be executed once, and then only execute again if "something changed."

The challenge is in the "something changed" part. A build system with perfect incremental behavior will have perfect knowledge of when "something changed."

---

# Build system evolution

### (We'll come back to this.)

1. Scripts (npm, make, just)
2. Task-based (lage, lerna)
3. Artifact-based (Bazel, Pants)

---

# Build system evolution

### (We'll come back to this.)

1. Scripts
2. Task-based **<-- fluid-build is here**
3. Artifact-based

---

# Gall's law

> **A complex system that works is invariably found to have evolved from a simple system that worked.** A complex system designed from scratch never works and cannot be patched up to make it work. You have to start over with a working simple system.

---

# Some history

When Fluid was getting started, packages looked like this:

```json
"scripts": {
  "full": "concurrently npm:build npm:copy",
  "build": "npm run compile && concurrently npm:docs npm:lint",
  "compile": "tsc",
  "copy": "copyfiles",
  "docs": "build-docs",
  "lint": "eslint",
}
```

That's pretty simple yet powerful; you build a "task graph" and efficiently order everything.

---

# But Fluid is more than one project...

Early versions of fluid-build would read the tasks and decompose them into a graph, using the `&&` and `concurrently` to denote the task relationships.

Essentially, we "invented" a tiny, underspecified domain-specific language to define tasks and cross-package relationships.

---

# The secret sauce

But fluid-build also did something really cool...

It read _all_ the projects scripts and the dependencies in `package.json`, and would put _those_ tasks into the graph, so now we had a task scheduler that worked across a group of packages!

---

<!-- _class: lead -->

And for an embarrassingly long time, because I was dumb and naïve, I thought that all that magic was enabled by `&&` and `concurrently`.

---

# Of course that wasn't true

The code had a **hardcoded** understanding of the relationship between the tasks of different packages.

For example, it knew that `compile` required its dependency's outputs, so would schedule those dependencies first.

On the other hand, it knew `lint` didn't require dependent builds, so it would schedule it accordingly.

There were a lot of these, and as the repo grew we started to see a bunch of new tasks and package.json uses.

---

# As the repo grew more complex

We moved the hard-coded relationships to configuration, which is how _all_ tasks are defined in a lot of similar systems like nx and lage.

We now have the best of both worlds - you can add tasks to individual packages that use `&&` and `concurrently`, and as long as they're called from one of the main build scripts, they will "just work."

You can also use npm lifecycle scripts like `pre` and `post`. fluid-build understands those relationships and will schedule accordingly.

---

# The last piece

But there was still one thing missing - root level tasks, like policy-check, syncpack, etc. So as a parting gift to the team, Curtis built that before he left.

---

# fluid-build's innovations

## Or: Why it's hard to quit fluid-build :)

1. Building the task graph without explicit task definitions using concurrently, `&&`, and/or npm lifecycle scripts. That is, you can get most of the the benefit of scheduling and caching without learning about "fluid-build tasks."
2. Intelligence baked into some tasks, like the TypeScript task, enables fluid-build to remove some tasks from the graph without fully checking its outputs. Bottom line - fluid-build is faster than comparable tools for building FluidFramework.

---

# Tasks

Here's what a task definition looks like:

```js
"lint": {
  dependsOn: [
    "check:format",
    "eslint",
    "good-fences",
    "depcruise",
    "check:exports",
    "check:release-tags",
  ],
  script: false,
},
...
```

---

# Default tasks

Tasks in the root fluid-build config are defaults.

If a package doesn't define a script/task matching the task, then it's just skipped.
This lets packages opt in to tasks over time.

---

# Package-level tasks

Tasks can also be defined at the package level in the `fluidBuild.tasks` node in package.json. This enables two scenarios:

1. Completely overriding the definition for a task with a package-specific definition.
2. Adding additional subtasks to an existing task definition using the `...` entry in the task dependencies.

---

An example adding per-project tasks:

```js
"lint": {
  dependsOn: [
    "...",
    "package-specific-task",
  ],
  script: false,
},
```

This will configure the lint task to depend on all the defaults defined in the root, and also the package-specific task that is unique to this package.

Tasks defined in individual packages must be defined, unlike the "task defaults" defined in the root config.

---

# The script property

The `script` property on tasks tells fluid-build if the command in the script should be executed or if the task definition should be used instead.

For example, consider:

```json
"scripts": {
    "build": "npm run compile && concurrently npm:api npm:docs npm:lint",
    "api": "api-extractor",
    "compile": "tsc",
    "docs": "build-docs",
    "lint": "eslint",
}
```

---

That is similar to:

```json
"scripts": {
    "build": "fluid-build --task build",
    "api": "api-extractor",
    "compile": "tsc",
    "docs": "build-docs",
    "lint": "eslint",
}
```

---

With a task definition like this:

```js
"lint": {
  dependsOn: [
    "api",
    "compile",
    "docs",
    "lint",
  ],
  script: false,
},

```

The second form can run dependent tasks, which is sometimes what you want, and sometimes isn't.

---

# How incremental builds work

fluid-build reads all the scripts and task definitions and builds a task graph.

Each task is mapped to a `Task` subclass in code based on its command.

For example, `eslint` is mapped to the `EslintTask`, `flub list` is mapped to the `FlubListTask`, etc.

These task mappings are defined in code (but could be config-based instead!)

---

# Task caching

A `Task` defines an `isUpToDate` function that can use whatever logic needed to determine if the task needs to be re-run.

Any task with an unknown command is called an `UnknownTask` and is not capable of incremental builds.

---

# Task caching

Many tasks have common needs, like a list of input and output files that, if changed, should trigger the task, so there are several Task variants like `LeafWithDoneFileTask` that used to define new tasks with minimal boilerplate.

These tasks output a cache file, called a "donefile" that is consulted to determine whether to rebuild.

Donefiles usually contain a list of paths and some metadata about the path, such as filestat info or file content hashes.

---

# tsc and related tasks

fluid-build integrates directly with the TypeScript compiler and uses its `.buildinfo` files to inform its caching behavior.

There is also a `TscDependentClass` that can be used for tasks that are closely tied to the TypeScript compilation process. This enables fluid-build to completely skip these tasks when tsc is skipped.

Examples include `ApiExtractorTask` and `EslintTask`.

---

# Adding new tasks to the build

- Within a package, you can add scripts directly and use concurrently and `&&`.
- If it's an unknown command, then you won't get caching. To add that you'd make a task in build-tools.
- If you're adding a new task to one of the main "build phases," like "compile" or "lint", it should be defined in the root fluid-build config.

---

# Should we keep using fluid-build?

> It's easier to see what a system does wrong than what it does right.

Any replacement should be at least as fast OR compensate through some other systemic benefit, such as cloud-based caching.

---

# Improvements to consider

- Support custom tasks - tasks that can be defined outside the core fluid-build code.
- Support an `InputOutput` task that can be used to define input/output globs and automatically build a donefile based on those config values. This is how many other systems define most of their tasks (for better or worse).
- Cross-machine caching. If I build main in one repo, then run a main build on a second separate repo on the same machine, the second repo should benefit from the cache from the first one.
