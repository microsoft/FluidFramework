[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / default entrypoint

# default entrypoint

This is the main entrypoint to the build-infrastructure API.

The primary purpose of this package is to provide a common way to organize npm packages into groups called release
groups, and leverages workspaces functionality provided by package managers like npm, yarn, and pnpm to manage
interdependencies between packages across a Fluid repo. It then provides APIs to select, filter, and work with those
package groups.

## Index

### Classes

- [FluidRepoBase](classes/FluidRepoBase.md)
- [NotInGitRepository](classes/NotInGitRepository.md)
- [PackageBase](classes/PackageBase.md)

### Interfaces

- [FluidPackageJsonFields](interfaces/FluidPackageJsonFields.md)
- [IFluidBuildDir](interfaces/IFluidBuildDir.md)
- [IFluidBuildDirs](interfaces/IFluidBuildDirs.md)
- [IFluidRepo](interfaces/IFluidRepo.md)
- [IFluidRepoLayout](interfaces/IFluidRepoLayout.md)
- [Installable](interfaces/Installable.md)
- [IPackage](interfaces/IPackage.md)
- [IPackageManager](interfaces/IPackageManager.md)
- [IReleaseGroup](interfaces/IReleaseGroup.md)
- [IWorkspace](interfaces/IWorkspace.md)
- [PackageDependency](interfaces/PackageDependency.md)
- [ReleaseGroupDefinition](interfaces/ReleaseGroupDefinition.md)
- [Reloadable](interfaces/Reloadable.md)
- [WorkspaceDefinition](interfaces/WorkspaceDefinition.md)

### Type Aliases

- [AdditionalPackageProps](type-aliases/AdditionalPackageProps.md)
- [IFluidBuildDirEntry](type-aliases/IFluidBuildDirEntry.md)
- [PackageJson](type-aliases/PackageJson.md)
- [PackageManagerName](type-aliases/PackageManagerName.md)
- [PackageName](type-aliases/PackageName.md)
- [ReleaseGroupName](type-aliases/ReleaseGroupName.md)
- [WorkspaceName](type-aliases/WorkspaceName.md)

### Variables

- [FLUIDREPO\_CONFIG\_VERSION](variables/FLUIDREPO_CONFIG_VERSION.md)

### Functions

- [createPackageManager](functions/createPackageManager.md)
- [getAllDependenciesInRepo](functions/getAllDependenciesInRepo.md)
- [getFluidRepoLayout](functions/getFluidRepoLayout.md)
- [isIPackage](functions/isIPackage.md)
- [isIReleaseGroup](functions/isIReleaseGroup.md)
- [loadFluidRepo](functions/loadFluidRepo.md)
