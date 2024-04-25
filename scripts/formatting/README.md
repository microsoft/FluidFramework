# Enable/disable formatter scripts

The scripts in this folder can be used to switch a project between prettier and biome formatting.

**THESE SCRIPTS DO NOT RUN ON WINDOWS.**

## Required dependencies

The scripts require the `npe` package be installed globally. To do that run `pnpm add -g npe`.

It also requires [sd](https://github.com/chmln/sd) which can be installed from a variety of different places. See [the
sd docs](https://github.com/chmln/sd#installation).

## Scripts

These scripts are intended to be run in individual projects. To run on multiple projects at a time use flub exec or pnpm
-r exec. For example:

```
flub exec -g client -- "~/code/FluidFramework/scripts/formatting/enable-biome.sh"
```

### enable-biome.sh

This script enables biome formatting in a project. It updates scripts to run biome and also adds a local biome config
file to the project if needed.

The `format:prettier` and `check:prettier` tasks are renamed to `format:prettier:old` and `check:prettier:old`
respectively. Those scripts can be used to run prettier manually if needed.

After running this script, you can clean up the package.json files by running `pnpm policy-check:fix`.

### enable-prettier.sh

This script enables prettier formatting in a project. It updates scripts to run prettier and undoes some changes made by
the enable-biome.sh script.

### remove-prettier.sh

Once a project is completely switched to biome and no longer needs prettier, this script will remove the prettier
dependency and any related scripts and config files.

## Converting a project

To convert a project to use prettier or biome, just run the appropriate script. After running the scripts, you may need
to run `policy-check:fix` from the root of the repo to sort the package.json changes.

Commit the resulting changes and open a PR.

## My project uses biome now, but I need to port a change to a branch that uses prettier

To do this more easily, format your local changes manually using the `format:prettier:old` script, and then create a
commit from those changes to PR into the target branch.
