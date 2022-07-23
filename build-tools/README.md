# @fluid-tools/build-tools

This folder contains packages used for building and managing the contents of Fluid Framework repositories and
implementing the Fluid Framework release process.

## @fluid-tools/build-cli (aka flub)

A build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

## @fluidframework/build-tools

This package contains both CLI tools and supporting code. This is the home of all the "classic" Fluid build tools, like
policy-check, fluid-bump-version, etc.

Note: Don't add new CLI commands to this package. Instead, add a new command to the `build-cli` package and import the
functionality you need from this package.

## @fluid-tools/version-tools

This package contains APIs and a CLI for working with semantic versioning version strings and ranges, especially those
using [Fluid-specific version schemes.](./packages/version-tools/README.md#version-schemes)

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
