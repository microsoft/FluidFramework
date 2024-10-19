[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / findGitRootSync

# Function: findGitRootSync()

```ts
function findGitRootSync(cwd): string
```

Returns the absolute path to the nearest Git repository root found starting at `cwd`.

## Parameters

• **cwd**: `string` = `...`

The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
provided.

## Returns

`string`

## Throws

A `NotInGitRepository` error if no git repo is found.

## Defined in

[packages/build-infrastructure/src/git.ts:226](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/git.ts#L226)
