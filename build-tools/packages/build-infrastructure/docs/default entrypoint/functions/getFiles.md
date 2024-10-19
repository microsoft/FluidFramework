[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / getFiles

# Function: getFiles()

```ts
function getFiles(git, directory): Promise<string[]>
```

Returns an array containing repo repo-relative paths to all the files in the provided directory.
A given path will only be included once in the array; that is, there will be no duplicate paths.
Note that this function excludes files that are deleted locally whether the deletion is staged or not.

## Parameters

• **git**: `SimpleGit`

• **directory**: `string`

A directory to filter the results by. Only files under this directory will be returned. To
return all files in the repo use the value `"."`.

## Returns

`Promise`\<`string`[]\>

## Defined in

[packages/build-infrastructure/src/git.ts:181](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/git.ts#L181)
