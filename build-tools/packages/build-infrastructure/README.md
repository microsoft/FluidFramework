# @fluid-tools/build-infrastructure

This package contains types and helper functions that are used across multiple build-tools packages, including
`@fluidframework/build-tools` and `@fluid-tools/build-cli`.

The primary purpose of this package is to provide a common way to enumerate Packages, Release Groups, and Workspaces
across a Fluid repo.

## API Overview

The API is built around four key types which form a hierarchy: `IFluidRepo`, `IWorkspace`, `IReleaseGroup`, and
`IPackage`. For the purposes of this documentation, the terms "Fluid repo," "workspace," "release group," and "package"
generally refer to these types.

### The Fluid repo

The primary entrypoint for the API is the `IFluidRepo` type. A Fluid repo can contain multiple workspaces and release
groups. Both workspaces and release groups represent ways to organize packages in the repo, but their purpose and
function are different.

### Workspaces

Workspaces are a generally a feature provided by the package manager (npm, yarn, pnpm, etc.). A workspace defines the
_physical layout_ of the packages within it. A workspace is rooted in a particular folder, and uses the configuration
within that folder to determine what packages it contains. The config used is specific to the package manager.

The workspace is also the boundary at which dependencies are installed and managed. When you install dependencies for a
package in a workspace, all dependencies for all packages in the workspace will be installed. Within a workspace, it is
trivial to link multiple packages so they can depend on one another. The `IWorkspace` type is a thin wrapper on top of
these package manager features.

### Release groups

While workspaces manage dependencies and physical layout of packages, release groups are focused on groups of packages
that are versioned and released together. Release groups are always a subset of a workspace, and must contain at least
one package. **Release groups cannot span multiple workspaces.**

Importantly, release groups are the unit that we release and version. In the v0 version of build-tools, release groups
and workspaces have a 1:1 relationship. With the types defined here in build-infrastructure, workspaces can contain
multiple release groups.

> [!IMPORTANT]  
> A workspace _must_ have at least one release group, and all packages must be a part of a release group.

### Packages

Packages are the lowest-level entity in build-infrastructure. A package _must_ be a part of a release group and
workspace in order to be managed with build-infrastructure. In general, developers should prefer using release groups -
which are ultimately just groups of packages - to working with individual packages.

### What about "independent packages?"

In the v0 version of build-tools, we have the concept of "independent packages:" packages that are not part of a release
group and are released independently. **This concept no longer exists. There are only release groups.** Packages that
release independently can either be part of a single-package workspace (and release group), or they can be part of
another larger workspace, contained within a single-package release group.

###

> [!IMPORTANT]  
> Crucial information necessary for users to succeed.

## Configuration

Configuration for the repo layout is stored in a config file at the root of the repo. This can either be part of the
`fluidBuild.config.cjs` file in the `repoLayout` property, or in an independent config file named
`repoLayout.config.cjs` (or mjs).

### Example

The following example configures three workspaces demonstrating the three archetypes - a workspace with multiple release
groups, a workspace with a single release group that contains multiple packages, and a workspace with a single release
group that contains a single package.

```js
repoLayout: {
  workspaces: {
    // This is the name of the workspace which is how it's referenced in the API.
    "client": {
      // This workspace is rooted at the root of the Git repo.
      directory: ".",
      releaseGroups: {
        // This key is the name of the release group. It must be unique across all
        // release groups.
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
            "@types/jest-environment-puppeteer"
            "fluid-framework",
          ],
          // A release group can have an OPTIONAL root package. This package
          // is typically private and is similar to the root package for a workspace.
          // This release group root package may be useful to store scripts or other
          // configuration only applies on the release group, 
          rootPackageName: "client-release-group-root",
          defaultInterdependencyRange: "workspace:~",

          // A release group may have an ADO pipeline URL associated with it. This
          // URL is used to provide direct links to the pipeline when running releases.
          adoPipelineUrl:
            "https://dev.azure.com/fluidframework/internal/_build?definitionId=12",
        },
        examples: {
          // This release group contains only the @fluid-example packages.
          include: ["@fluid-example"],
          rootPackageName: "examples-release-group-root",
          defaultInterdependencyRange: "workspace:~",
        },
        // If any packages in the workspace don't match a release group, loading the
        // repo layout config will throw an error.
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
          defaultInterdependencyRange: "workspace:~",
          adoPipelineUrl:
            "https://dev.azure.com/fluidframework/internal/_build?definitionId=14",
        },
      },
    },
  },
}
```

### Loading a Fluid repo from a configuration file

To load a Fluid repo, you use the `loadFluidRepo` function. You can pass in a path to a Git repository root, or if one
is not provided, then the Git repository nearest to the working directory can be used.

This function will look for a repo layout configuration in that folder and load the workspaces, release groups, and
packages accordingly and return an `IFluidRepo` object that includes Maps of workspaces, release groups, and packages as
properties.

## Other APIs

### Type guards

You can use the `isIPackage` and `isIReleaseGroup` functions to determine if an object is an `IPackage` or
`IReleaseGroup` respectively.

### Base classes

The `PackageBase` abstract class can be used as a base class to create custom `IPackage` classes.
