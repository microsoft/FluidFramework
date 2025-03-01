# Enable/disable formatter scripts

The scripts in this folder can be used to switch a project between prettier and biome formatting.

**THESE SCRIPTS DO NOT RUN ON WINDOWS.**

## Status as of 2025-02-21

The client release group has been converted to Biome and all prettier dependencies and scripts have been removed.
However, the scripts in this folder remain because other parts of the repo do not yet use biome (for example, server), and these scripts will
be useful if/when we convert those projects.

## Required dependencies

The scripts require the `npe` package be installed globally. To do that run `pnpm add -g npe`.

## Scripts

These scripts are intended to be run in individual projects. To run on multiple projects at a time use `flub exec` or
`pnpm -r exec`. For example:

```
flub exec -g client -- "~/code/FluidFramework/scripts/formatting/enable-biome.sh"
```

### add-biome.sh

This script adds biome formatting scripts to a project. It also adds a local biome config file to the project if needed.

The `format:prettier` and `check:prettier` tasks are left intact, and the `format` task still calls prettier. This
enables one to manually format using biome while leaving the overall build using prettier.

After running this script, you can clean up the package.json files by running `pnpm policy-check:fix`.

### enable-biome.sh

This script enables biome formatting in a project. It updates the `format` and `check:format` scripts to call biome. It
should only be run on projects that have already had biome added to it.

### enable-prettier.sh

This script enables prettier formatting in a project. It updates the `format` and `check:format` scripts to call
prettier. It's the opposite of the enable-biome.sh script.

### remove-prettier.sh

Once a project is completely switched to biome and no longer needs prettier, this script will remove the prettier
dependency and any related scripts and config files.

## Converting a project

To convert a project to use prettier or biome, just run enable-prettier.sh or enable-biome.sh. After running the
scripts, you may need to run `policy-check:fix` from the root of the repo to sort the package.json changes.

Commit the resulting changes and open a PR.

## My project uses biome now, but I need to port a change to a branch that uses prettier

To do this more easily, format your local changes manually using the `format:prettier` script, and then create a
commit from those changes to PR into the target branch.
