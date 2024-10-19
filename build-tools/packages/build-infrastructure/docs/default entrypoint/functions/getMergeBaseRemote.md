[**@fluid-tools/build-infrastructure**](../../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../../README.md) / [default entrypoint](../README.md) / getMergeBaseRemote

# Function: getMergeBaseRemote()

```ts
function getMergeBaseRemote(
   git, 
   branch, 
   remote?, 
localRef?): Promise<string>
```

Get the merge base between the current HEAD and a remote branch.

## Parameters

• **git**: `SimpleGit`

• **branch**: `string`

The branch to compare against.

• **remote?**: `string`

The remote to compare against. If this is undefined, then the local branch is compared with.

• **localRef?**: `string` = `"HEAD"`

The local ref to compare against. Defaults to HEAD.

## Returns

`Promise`\<`string`\>

The ref of the merge base between the current HEAD and the remote branch.

## Defined in

[packages/build-infrastructure/src/git.ts:24](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/git.ts#L24)
