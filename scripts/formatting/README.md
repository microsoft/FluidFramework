# Enable/disable formatter scripts

The scripts in this folder can be used to switch a project between prettier and biome formatting.

**THESE SCRIPTS DO NOT RUN ON WINDOWS.**

## Required dependencies

The scripts require the `npe` and `dot-json` packages be installed globally.
To do that run `pnpm add -g npe dot-json`.

## Scripts

### add-biome.sh

This script adds biome to a project. It add scripts to run biome and also adds a local biome config file to the project
if needed.
