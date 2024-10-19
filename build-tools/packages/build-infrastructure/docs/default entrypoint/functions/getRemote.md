[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / getRemote

# Function: getRemote()

```ts
function getRemote(git, partialUrl): Promise<string | undefined>
```

Get a matching git remote name based on a partial URL to the remote repo. It will match the first remote that
contains the partialUrl case insensitively.

## Parameters

• **git**: `SimpleGit`

• **partialUrl**: `undefined` \| `string`

partial URL to match case insensitively

## Returns

`Promise`\<`string` \| `undefined`\>

## Defined in

[packages/build-infrastructure/src/git.ts:155](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/git.ts#L155)
