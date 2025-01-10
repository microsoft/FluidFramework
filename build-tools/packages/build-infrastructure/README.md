# @fluid-tools/build-infrastructure

This package contains types and helper functions that are used across multiple build-tools packages, including
`@fluidframework/build-tools` and `@fluid-tools/build-cli`.

The primary purpose of this package is to provide a common way to organize npm packages into groups called release
groups, and leverages workspaces functionality provided by package managers like npm, yarn, and pnpm to manage
interdependencies between packages across a build project. It then provides APIs to select, filter, and work with those
package groups.

## API Overview

The API is built around four key types which form a hierarchy: `IBuildProject`, `IWorkspace`, `IReleaseGroup`, and
`IPackage`. For the purposes of this documentation, the terms "build project," "workspace," "release group," and "package"
generally refer to these types.

Conceptually, a **build project** is a way to organize npm packages into groups for versioning, release, and dependency
management. A build project can contain multiple **workspaces**, each of which may contain one or more **release groups**.

### The build project

The primary entrypoint for the API is the `IBuildProject` type. A build project can contain multiple workspaces and release
groups. Both workspaces and release groups represent ways to organize packages in the repo, but their purpose and
function are different.

### Workspaces

Workspaces are generally a feature provided by the package manager (npm, yarn, pnpm, etc.). A workspace defines the
_physical layout_ of the packages within it. A workspace is rooted in a particular folder, and uses the configuration
within that folder to determine what packages it contains. The config used is specific to the package manager.

The workspace is also the boundary at which dependencies are installed and managed. When you install dependencies for a
package in a workspace, all dependencies for all packages in the workspace will be installed. Within a workspace, it is
trivial to link multiple packages so they can depend on one another. The `IWorkspace` type is a thin wrapper on top of
these package manager features.

Importantly, this package does not attempt to re-implement any features provided by workspaces themselves. Users are
expected to configure their package managers' workspace features in addition to the build project configuration.

A build project will only load packages identified by the package manager's workspace feature. That is, any package in the
repo that is not configured as part of a workspace is invisible to tools using the build project.

### Release groups

While workspaces manage dependencies and physical layout of packages, release groups are focused on groups of packages
that are _versioned and released together_. Release groups are always a subset of a workspace, and must contain at least
one package. **Release groups cannot span multiple workspaces.**


> [!IMPORTANT]
> A workspace _must_ have at least one release group, and all packages must be a part of a release group.

> [!NOTE]
> In the v0 version of build-tools, release groups and workspaces have a 1:1 relationship. In contrast, with the types
> defined here in build-infrastructure, workspaces can contain multiple release groups.

### Packages

Packages are the lowest-level entity in build-infrastructure. A package _must_ be a part of both a release group and
workspace in order to be managed with build-infrastructure. In general, developers should prefer using release groups -
which are ultimately just groups of packages - to working with individual packages.

### What about "independent packages?"

In the v0 version of build-tools, we have the concept of _independent packages_: packages that are not part of a release
group and are released independently. **This concept no longer exists. There are only release groups.** Packages that
release independently can either be part of a single-package workspace (and release group), or they can be part of
another larger workspace, contained within a single-package release group.

## Features

### Git repo capabilities

A build project is often contained within a Git repository, and some functionality expects to be used within a Git
repository. Features that need to execute Git operations can asynchronously retrieve the SimpleGit instance using the
`IBuildProject.getGitRepository` API. If the build project is not within a Git repo, then that call will throw a
`NotInGitRepository` exception that callers should handle appropriately. If they don't, though, the exception makes it
clear what has happened.

> [!NOTE]
>
> This design addresses a major problem with build-tools v0, which was that code often made assumptions that it was
> operating within a Git repo. That's often true, and some fetures can and should only work in that context, but the
> implementation attempted to load the Git functionality blindly and would fail outright outside a Git context. With
> `IBuildProject`, the Git integration is more loosely coupled and the APIs make it clearer that it is not safe to assume
> the presence of a Git repo.

### Package selection and filtering APIs

The `IBuildProject` object provides access to workspaces, release groups, and their constituent packages, but often one wants
to operate on a subset of all packages in the repo. To support this, build-infrastructure provides a selection and
filtering API. Packages can be selected based on criteria like workspace and release group, and the lists can be further
filtered by scope or private/not private. Advanced filtering not covered by the built-in filters can be implemented
using `Array.prototype.filter` on the results of package selection.

### Built-in command-line tool to examine project layout and config

The included CLI tool makes it easy to examine the contents and layout of a build project. See [the CLI
documentation](./docs/cli.md) for more information.

### Loading old config formats

The `repoPackages` configuration currently used by fluid-build will be loaded if the newer `buildProject` config can't be
found. This is for back-compat only and will not be maintained indefinitely. Users should convert to `buildProject` when
possible.

## Configuration

Configuration for the build project is stored in a config file at the root of the repo. This can either be part of the
`fluidBuild.config.cjs` file in the `buildProject` property, or in an independent config file named
`buildProject.config.cjs` (or mjs).

### Example

The following example configures three workspaces demonstrating the three archetypes - a workspace with multiple release
groups, a workspace with a single release group that contains multiple packages, and a workspace with a single release
group that contains a single package.

```js
buildProject: {
  workspaces: {
    // This is the name of the workspace which is how it's referenced in the API. All workspaces in a build project must
    // have a unique name.
    "client": {
      // This workspace is rooted at the root of the Git repo.
      directory: ".",
      releaseGroups: {
        // This key is the name of the release group. All release groups in a build project must have a unique name.
        client: {
          // The include property can contain package names OR package scopes. If
          // a scope is provided, all packages with that scope will be a part of
          // the release group.
          include: [
            // Include all the Fluid Framework scopes and packages except for
            // @fluid-example.
            "@fluidframework",
            "@fluid-experimental",
            "@fluid-internal",
            "@fluid-private",
            "@fluid-tools",
            // This private package is part of the client release group
            "@types/jest-environment-puppeteer"
            "fluid-framework",
          ],
          // A release group can have an OPTIONAL root package. This package
          // is typically private and is similar to the root package for a workspace.
          // This release group root package may be useful to store scripts or other
          // configuration that only applies on the release group,
          rootPackageName: "client-release-group-root",

          // A release group may have an ADO pipeline URL associated with it. This
          // URL is used to provide direct links to the pipeline when running releases.
          adoPipelineUrl:
            "https://dev.azure.com/fluidframework/internal/_build?definitionId=12",
        },
        examples: {
          // This release group contains only the @fluid-example packages.
          include: ["@fluid-example"],
          // Release group root packages are optional but can be useful to store scripts that are tuned to
          // apply to only that release group.
          rootPackageName: "examples-release-group-root",
        },
        // If any packages in the workspace don't match a release group, loading the
        // build project config will throw an error.
      },
    },
    "build-tools": {
      // This workspace is rooted in the build-tools folder. This folder must contain
      // a workspace config. The specific config depends on the package manager being used.
      directory: "./build-tools",
      releaseGroups: {
        // Release groups can have the same name as workspaces, but all release group names
        // must be unique regardless of the workspace they belong to.
        "build-tools": {
          include: [
            // Include all Fluid Framework scopes. Only packages contained in the workspace
            // will be included, so it is safe to use the same scopes in multiple release
            // group definitions as long as they're in different workspaces.
            "@fluidframework",
            "@fluid-example",
            "@fluid-experimental",
            "@fluid-internal",
            "@fluid-private",
            "@fluid-tools",
          ],
          rootPackageName: "build-tools-release-group-root",
          adoPipelineUrl:
            "https://dev.azure.com/fluidframework/internal/_build?definitionId=14",
        },
      },
    },
  },
}
```

### Loading a build project from a configuration file

To load a build project, you use the `loadBuildProject` function. You can pass in a path to a Git repository root, or if one
is not provided, then the Git repository nearest to the working directory can be used.

This function will look for a build project configuration in that folder and load the workspaces, release groups, and
packages accordingly and return an `IBuildProject` object that includes Maps of workspaces, release groups, and packages as
properties.

## Other APIs

### Type guards

You can use the `isIPackage` and `isIReleaseGroup` functions to determine if an object is an `IPackage` or
`IReleaseGroup` respectively.

### Base classes

The `PackageBase` abstract class can be used as a base class to create custom `IPackage` classes.

## Miscellaneous improvements

### Build projects can be rooted anywhere

Build projects are rooted where their config file is located, _not_ at the root of a Git repo. There can be multiple Fluid
repos within a Git repo, though this is usually only needed for testing. In typical use only a single build project per
Git repo is needed. However, the build project does _not_ need to be rooted at the root of Git repo, and code should not
assume that the root of the build project is the same as the root of a Git repo.

### Better testing

There is now a test project within the repo that is a fully functional build project. There are basic unit tests that verify the
loading of the build project config and that packages are organized as expected. This is a dramatic improvement from v0
build-tools, in which all package traversal logic was effectively untested.

There are also tests for the selection and filtering APIs.

This infrastructure also provides a foundation for further test improvements, and testing other new features of Fluid
repos. In the past it was challenging to add new features because there was no way to test those features effectively.
That should be much easier now.

## Known gaps

- Inadequate testing of git-related APIs - can we mock git somehow?
