# Managing Dependencies

## Adding new dependencies...

### ...to a package

To add new dependencies to a package, run `pnpm add <pkg>` from the package folder.
Add `-D` to add a devDependency.

pnpm will add and install the requested dependency.
**If the package is already used in the release group (the pnpm workspace), the pnpm add command will use the same version.**

Read more in the [pnpm add documentation](https://pnpm.io/cli/add).

### ...to a subset of packages

pnpm supports a [robust package filtering syntax](https://pnpm.io/filtering) that can be used with most pnpm commands, including `add`.
You can run commands only on packages that [match a particular scope](https://pnpm.io/filtering#--filter-package_name), [depend on specific other packages](https://pnpm.io/filtering#--filter-package_name-2), those that are [in a particular directory](https://pnpm.io/filtering#--filter-glob---filter-glob), and even [those that have been edited since a previous commit](https://pnpm.io/filtering#--filter-since).

### ...to the root package of a release group

If you want to add a dependency to the root package in the release group, append `-w` to the `pnpm add` command.
That is:

```shell
pnpm add @types/react @types/react-dom -D -w
```

## Removing dependencies...

You can remove a dependency from a package by running `pnpm remove <pkg>` from the package folder.

Read more in the [pnpm remove documentation](https://pnpm.io/cli/remove).

## Finding outdated dependencies

To find outdated dependencies, you can use `pnpm outdated`.
It checks for outdated packages which you can then upgrade using `pnpm update`.

Read more in the [pnpm outdated documentation](https://pnpm.io/cli/outdated).

## Upgrading external dependencies

At some point, you'll need to update dependencies in the repo to a new version.
Upgrading dependencies can be dangerous and destabilizing, especially when upgrading across major versions.
For clarity in this section, we will use the terms "safe" and "unsafe" to mean the following:

- A **safe upgrade** is one that SHOULD NOT break or invalidate existing code. That is, a safe upgrade should require no code changes to upgrade.
- An **unsafe upgrade** is one that MAY break or invalidate existing code. You should expect to need additional code or config changes in order to integrate the new version.

We try to express the relative safety of an upgrade type with the dependency range we use with that dependency in package.json.
For example, most of our dependencies are safe to update to new minor versions, so we use caret (`^`) dependency ranges in package.json.
However, some of our dependencies, like eslint and typescript, are only safe to update to new patch versions, so we use tilde (`~`) dependency ranges for them.

There are a few tools we use to help manage dependencies in the repo:

- [pnpm](https://pnpm.io/)
- [npm-check-updates](https://github.com/raineorshine/npm-check-updates) (ncu).
- Our own [`flub modify lockfile` command](../../../build-tools/packages/build-cli/docs/modify.md#flub-modify-lockfile-package_or_release_group)

`pnpm` can do most things, but `ncu` offers finer-grain control over the updates.
Some packages also don't use pnpm, which means ncu is the better option for those packages. `flub modify lockfile` is pretty surgical, since it expects a specific dependency name and version; it's particularly useful to address CVEs that require us to update a specific dependency that is not a direct dependency of our packages, as described further down in [Upgrading transitive dependencies](#upgrading-transitive-dependencies).

### "Safe"/lockfile-only upgrades

To upgrade a dependency to the latest version allowed by the package.json dependency range, you technically don't need to update the package.json files, only the lockfiles.
However, for clarity, we try to update the package.json to express the new "minimum version" expected.
For example, if a dependency had the range `^14.1.2`, and version `14.2.0` is available, then we prefer to update the package.json range to be `^14.2.0` even though updating the resolved version in the lockfile is enough. `pnpm update` will usually update package.json in addition to the lockfile.

#### With pnpm

To update all dependencies to their latest versions according to their dependency ranges, use `pnpm update`.
By default it will update _all_ dependencies, which is probably not what you want, but there are lots of filtering options.

You can also pass the `-i` flag to use an interactive terminal UX to select the packages to update.

Read more in the [pnpm update documentation](https://pnpm.io/cli/update).

##### Example 1

Upgrade css-loader to the latest version compatible with the dependency range in package.json across all packages in the release group.

```shell
pnpm update css-loader -r
```

##### Example 2

Upgrade react and react-dom in @fluid-experimental packages only.

```shell
pnpm update react react-dom -r --filter '@fluid-experimental/*'
```

#### With npm-check-updates

TODO

### "Unsafe" upgrades

#### With pnpm

Update typescript to the latest release across all packages in the release group.
Important: this _may make unsafe major version upgrades!_

```shell
pnpm update typescript -r --latest
```

#### With npm-check-updates

TODO

### Upgrading transitive dependencies

Sometimes we need to update a particular transitive dependency to a version that is already supported by the semver range dependency declared by its direct dependent package, and we want to make it a super-targeted changed that does not update anything else, to minimize risk.
A common example of this is when we need to address a CVE by updating a transitive dependency to its lastest patch.

We wrote the [`flub modify lockfile` command](../../../build-tools/packages/build-cli/docs/modify.md#flub-modify-lockfile-package_or_release_group) to help in this scenario.
You can run `flub modify lockfile --help` (if you have installed `flub` globally; otherwise prepend `npx` to that command) to see its documentation and how to use it. `flub modify lockfile` uses [pnpm overrides](https://pnpm.io/settings#overrides) under the hood.

Note that the way it works as of 2024-06-12, it will only be useful if the target version of the dependency we want to update is already supported by the semver range declared by the package(s) that depends on it.
If that's not the case, we might need to look for alternatives, like a more permanent pnpm override in `package.json` or updating the parent dependency(ies).

## Upgrading Fluid dependencies

While you can technically use any tool to upgrade Fluid dependencies, we recommend you use [flub bump deps](../../../build-tools/packages/build-cli/docs/bumpDetails.md), which is designed for this scenario.

## Using different versions of dependencies

pnpm enables us to use different versions of dependencies in different projects within the same release group (workspace in pnpm terms).
While there are legitimate uses for this capability, we prefer to use the same version of dependencies across the repo whenever possible.

The [pnpm dedupe](https://pnpm.io/cli/dedupe) command can be used to deduplicate dependencies in the lockfile.
It will remove older versions from the lockfile if their dependency ranges can be met with a newer version.

## Addressing CVE's

CVE's (Critical Vulnerability Exploit) in our package dependencies need to be occasionally patched.
You can find any outstanding CVE's affecing us by looking at a recent build of the "Build - Client Packages" pipeline under the "Component Detection" step.
This step is Component Detection step is provided by Microsoft.
You'll find a snippet of pipeline output looking like:

![image](https://github.com/microsoft/FluidFramework/assets/105244057/2b2b0e75-43a1-4708-989c-1e6602468406)

From here, the first step is to investigate the CVE itself.
Lets take CVE-2021-23337 as an example.
You'll want to check a few sources to gather more details:

1. NIST: <https://nvd.nist.gov/vuln/detail/cve-2021-23337>
2. Github: <https://github.com/advisories/GHSA-35jh-r3h4-6jhm>

You'll find that the Github website will sometimes list additional dependencies affected by the CVE, using our CVE above as an example, you'll see Github lists lodash-template as being affected as well which is not noted in the output from Microsoft Component Detection.

Now its time to dig into FluidFramework dependencies to track which packages are using the affected versions so we can upgrade them.

### Finding dependencies using pnpm why

[pnpm why](https://pnpm.io/cli/why) is a powerful command that can be used to determine why a dependency shows up in our repo's dependency tree.
For example, by running `pnpm -r why lodash.template`, you can see where that dependency is used within the repo, its version, and which dependencies are bringing it in.

![image](https://github.com/microsoft/FluidFramework/assets/105244057/64a6598d-e8eb-4d1c-9f8a-2a6b9857d04c)

### Finding dependencies manually

The root pnpm-lock.yaml file allows us to trace both direct and transitive dependencies back to the actual packages in the monorepo that are using them.

Using VSCodes built in search is a powerful feature for searching the pnpm-lock.yaml, if we search for `lodash.template` we'll get multiple hits giving us a starting point for determining:

1. Which packages use this dependency?
2. Is this dependency directly used or is it a transitive dependency (A dependency of a dependency that is directly used)?

![image](https://github.com/microsoft/FluidFramework/assets/105244057/de8cfdbe-7f6f-4e12-9256-b6ddbcd1a243)

For example, we see that the pnpm-lock file for the `build-tools` package contains lodash.template.
From here, if don't see `lodash.template` specified directly in the `package.json` file for the `build-tools` package then it must be a transitive dependency.
We'll have to track down which direct dependency is using lodash-template and if we can upgrade it to a newer version that uses a newer version.
We can track this dependency by reading through the packages `pnpm-lock.yaml` file directly.

You can check for newer versions of an NPM package by going directly to the website NPM package and clicking on the version tab.
