# Updating Code Using Legacy Fluid APIs

## Background

Beginning with version 2.0.0-rc.3.0.0, Fluid Framework packages have narrowed the public API that is exposed via the default package entry point.
This means that some existing code will need to be updated to import the APIs from the `./legacy` entry point.

For example, consider this import statement:

```ts
import { ContainerRuntime } from "@fluidframework/container-rutime";
```

In version 2.0.0-rc.3.0.0 and beyond, that import statement should be updated to be:

```ts
import { ContainerRuntime } from "@fluidframework/container-rutime/legacy";
```

_Note: The `./legacy` entry point was added in version 2.0.0-rc.3.0.0, but all exports were still available via the default entry point.
This means you can upgrade to the latest patch release of RC3 thru RC5 - without any import changes, then update imports any time before updating to 2.0.0 that requires use of additional path specification.
(In early versions of RC4, 2.0.0-rc.4.0.x, and RC5, 2.0.0-rc.5.0.x, the exports were removed from the default entry point.
In the latest RC4 and RC5 patches all exports were restored to the default entry point.)_

The Fluid Framework provides a tool to automate the rewriting of imports in your source files based on the current Fluid Framework packages installed.
This command-line tool is distributed as part of the @fluid-tools/build-cli package.

## Installation

It's easiest to install the build-cli globally:

```shell
npm install --global @fluid-tools/build-cli@latest

OR

yarn install --global @fluid-tools/build-cli@latest
```

## Usage

Make sure Fluid Framework packages are installed using repo's package manager (e.g. `npm install`).
Then you can rewrite the imports for a project by running `flub modify fluid-imports` and pointing it to the tsconfig.json file for your project.

```shell
flub modify fluid-imports --tsconfigs tsconfig.json
```

The flag defaults to `tsconfig.json` so it could be omitted in the example above.

If you have multiple tsconfigs, for example a primary tsconfig and a test tsconfig, you can list them all.
For example:

```shell
flub modify fluid-imports --tsconfigs tsconfig.json test/tsconfig.json
```

### Monorepo usage

Using `flub modify fluid-imports` in a monorepo is straightforward.
At a high level, the process is: for each package in the monorepo, run `flub modify fluid-imports` pointing at the project's tsconfig.json file.

If some projects in the monorepo use a different structure, you may list all of the possible tsconfig.json file locations. `flub modify fluid-imports` will only report an error if none of the tsconfig.json paths listed are found.
Alternatively, manually run `flub modify fluid-imports` multiple times.

Most monorepo workspace managers have a way to execute a command for each package in the workspace.
However, an alternative is to use [manypkg](https://github.com/Thinkmill/manypkg#manypkg-exec-cli-command), which understands yarn, pnpm, and npm workspaces.
To use it, install the manypkg cli globally:

```bash
npm install --global @manypkg/cli
```

Once installed, you can run a command like the following from the root of your workspace to update the imports for multiple projects:

```shell
manypkg exec flub modify fluid-imports --tsconfigs tsconfig.json src/tsconfig.json test/tsconfig.json one-off/tsconfig.json
```

## Advanced options

You may want to update imports from only some Fluid Framework packages.
To do this, use the `--packageRegex` flag.
Only packages matching the expression will have their imports updated.

## Limitations

There are handful of things that tool will not handle:

- Unnamed "all" imports. For example, `import * from "fluid-framework"`.
- Re-exports. For example, `export { Tree } from "fluid-framework"`.
- Dynamic import or require. For example, `import("fluid-framework")`.
- Matching source formatting. After running the tool, use any formatter like `Prettier` to update any modifications to conform.
