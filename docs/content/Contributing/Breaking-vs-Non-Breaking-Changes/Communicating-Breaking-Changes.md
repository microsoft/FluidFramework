_**Update June 21 2023**_: BREAKING.md and the processes described below are being replaced by [Changesets](./Changesets.md).

# How do we communicate breaking changes?

BREAKING.md and the processes described below are being replaced by [Changesets](./Changesets.md).

~~In order to inform our users of breaking changes in FluidFramework, we utilize the `BREAKING.md` file located in the root of the repository. For each breaking change, there should a corresponding note explaining the change. These notes fall into two categories: **Breaking Changes** and **Upcoming Changes**.~~

## Breaking Changes vs Upcoming Changes

Breaking changes are changes included in the release version it is listed under. For example, a breaking change note under the "2.0.0 Breaking Changes" section will be present in major release 2.0.0. An important note to remember is that breaking changes will only be present in **major** releases.

Upcoming changes include anything expected to become a breaking change in the future. The purpose of upcoming change notes is to provide an **actionable item** in the current release to prepare for a breaking change in a future release (not necessarily the next release). For example, you should write an upcoming change note when deprecating an API. The upcoming change note will signal that the API will be removed in a future release, while also providing a replacement API to migrate usage to in the current release. This will help our users prepare for the breaking change (in this case removing the API) in a future release. An important note to remember is that we may announce upcoming changes during a **minor or major** release. Although there will never be a breaking change in a minor release, we may introduce actionable items via upcoming changes and allow users to decide when to act upon them.

## Communicating the reasoning for a breaking change

It's important to communicate to our users why a breaking change took place and how it will ultimately benefit them. We do this because it will give users more motivation to bump their version of FluidFramework despite the extra work it may take to integrate the breaking changes included. We often will need to provide a more in-depth explanation, which is too long for a breaking change note in BREAKING.md. Instead, we should write it in the [What's New](https://fluidframework.com/docs/updates/v1.0.0/) section on FluidFramework.com.

## Writing a change note

Use the following guidelines when constructing a breaking change note in BREAKING.md:

- Provide a concise title. It should be clear what the topic of the change is.
- Ensure the affected packages are named or clearly identifiable within the body.
- Provide guidance on how the change should be consumed if applicable, such as by specifying replacement APIs.
- Consider providing code examples as part of guidance for non-trivial changes.
- Avoid using code formatting in the title (it's fine to use in the body).
- To explain the benefit of your change, use the [What's New](https://fluidframework.com/docs/updates/v1.0.0/) section on FluidFramework.com.

Below are examples of an upcoming change note and a breaking change note following these guidelines.

### Example Upcoming Change Note

````markdown
## 1.0.0 Upcoming changes

- [Deprecate connected property from IContainer](#Deprecate-connected-property-from-IContainer)

### Deprecate connected property from IContainer

The `connected` field has been deprecated from `IContainer` the `@fluidframework/container-definitions`.
The property will be removed in a future release.
Please migrate all usage to `IContainer.connectionState` (see example below). Note: `ConnectionState` can be imported from the fluid-framework package.

```diff
- if (container.connected) {
+ if (container.connectionState === ConnectionState.Connected) {
    console.log("Container is connected");
}
```
````

### Example Breaking Change Note

````markdown
## 2.0.0 Breaking changes

- [Removed connected property from IContainer](#Remove-connected-property-from-IContainer)

### Removed connected property from IContainer

The `connected` field is removed from `IContainer` in the `@fluidframework/container-definitions` package.
It was deprecated in 1.0.0 and it is now in removed in 2.0.0.
Please use `IContainer.connectionState` instead (see example below). Note: `ConnectionState` can be imported from the fluid-framework package.

```diff
- if (container.connected) {
+ if (container.connectionState === ConnectionState.Connected) {
    console.log("Container is connected");
}
```
````
