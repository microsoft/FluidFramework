## Introduction

This article is intended to guide you on best practices for making changes that are as backwards compatible as possible, and contains guidelines for how to introduce any necessary breaking changes safely.

## Version Definitions

Within the Fluid Framework, there are a few different package releases for different sections of the codebase. They are defined as follows, along with their respective definitions file that define the version interface:

- Server (protocol-definitions)
    - This is the structure of data over the network: ops, quorum, summary, etc.
    - Consumed by server, loader, drivers, runtime, etc.
- Driver (driver-definitions)
    - This is the driver API to be consumed by the loader and runtime
- Loader (container-definitions)
    - This is the container and loader API to be consumed by the runtime
- Client Runtime (runtime-definitions)
    - This is the runtime API to be consumed by the Fluid objects

The server version is decided by the server, so we want to change protocol-definitions as infrequently as possible.

The driver and loader versions are decided by the hosting application. In the case of the web app, this will likely always be latest available, but other hosts may be fixed and need to load newer runtimes.

## Version Compatibility

These different pieces are expected to maintain compatibility amongst each other across different version releases. See [Breaking vs Non breaking Changes](./Breaking-vs-Non-Breaking-Changes.md#types-of-breaking-changes) for more information on the different compatibility interfaces and their required version compatibility.

## Guidelines

When convenient, make changes that are backwards compatible and do not require API/interface changes.

### Protocol Definitions

Any changes to the `@fluidframeworks/protocol-definitions` package must be vetted highly. They will require a separate PR into the server project first anyway. We will want all changes to be backward-compatible.

### Container Definitions and Driver Definitions

Any changes to the `@fluidframeworks/container-definitions` package or the `@fluidframeworks/driver-definitions` package should be made backwards compatible with the runtime both ways.

- Changes to interfaces that are implemented by loader/container or driver objects: the implementations should satisfy the previous version's interface as well. This helps new loader work with old runtime.
- Changes to interfaces that are implemented by runtime objects: the implementations should satisfy the previous version's interface as well. This helps new runtime work with old loader.
- Changes to interfaces that represent data shared between runtime and loader: code referencing these should handle both the old format and the new. Typically this can be done at the point of first encountering that data to minimize downstream places to change. So the producing code should create something satisfying both the old and new interfaces, and the consuming code should convert old to new if needed when first seeing this object.

### Runtime Definitions

Any changes to the `@fluidframeworks/runtime-definitions` package should be made backwards compatible with external code (i.e. Fluid object code).

- Changes to interfaces that are implemented by the runtime objects: the implementations should satisfy the previous versions interface as well. The helps new runtime work with old Fluid object code.
- Changes to interfaces that represent data shared between runtime and external code: code referencing these should handle both the old format and the new. Typically this can be done at the point of first encountering that data to minimize downstream places to change. So the producing code should create something satisfying both the old and new interfaces, and the consuming code should convert old to new if needed when first seeing this object.

### Keeping Code Clean and Tracking Breaking Changes

Whenever making a change that is backwards compatible, there are some practices to follow to keep changes the code consistent and clean. The following outlines how to make an API breaking change.

#### Making the Change

It is required to make the change such that it is backwards compatible in <b>both</b> directions.
After two or more versions have passed, the change can be revisited to clean it up by removing the backwards compatible code.
You can create a GitHub issue to track the removal of this code to ensure that it does not get lost in the changes and forgotten, as this will cause unnecessary code bloat.

#### Isolate Backwards Compatible Code

It is nice to isolate the backwards compatible code as much as possible, rather than inline it. This will help make it clear to readers of the code that they should not rely on that code, and it will make removing it in the future simpler.

One strategy is to write the code as it should be without being backwards compatible first, and then add extra code to handle the old API.

#### Comment Appropriately

Add comments to indicate important changes in APIs, for example if an API is deprecated, add a comment to indicate such.

In addition to isolating backwards compatible code, adding comments can also help identify all places to change when revisiting in the future. Using a consistent comment format can make it easier to identify these places in the future.

```typescript
/**
 ** back-compat: 0.19.2 client
 ** TODO #{GitHub issue number}
 */
```

The above format is nice, as it contains the version and a brief tag and is easy to find all references in the code later. It also contains the issue number so it makes it easy to reference where the code that needs to be removed for that issue lives.

#### Track the Follow-Up Work

As mentioned above, it is a good idea to track the follow-up work to remove this backwards compatible code to keep the code pruned. The code's complexity will creep up as more backwards compatible code comes in. A good strategy is to create a GitHub issue and include information that provides context and makes it easy for someone to cleanup in the future.

#### Update the Docs

During the initial change, it is important to make sure the API changes are indicated somewhere in the docs.
After making the follow-up change to remove the backwards compatible code, it should be documented in the `BREAKING.md` file so that it is clear that it will break.

### Testing boundary-cross changes locally

When making a change in a dependency, you can rewire your local repo so downstream packages install the local dependency (containing your changes), rather than pulling from the package feed. This allows you to try coding against it in the dependent packages to ensure it will work properly. You must check in the code layer-by-layer though (see the next section for more info). Note these steps (along with the below steps to publish and consume a prerelease) are required even if a prerelease version is already specified for the dependency.

Prerequisite -- These commands assume you have installed the `@fluidframework/build-tools` package, either via `npm i -g` or `npm link`. You can also invoke similar commands using `npm run` scripts at the repo root (e.g. `npm run build:fast --` in place of `fluid-build`).

#### Steps

1. Be on the branch containing the changes to the dependency.
1. `fluid-build --reinstall` - This will remove all installed dependencies and reinstall fresh
1. `fluid-bump-version -d <dependency-you-changed> --local` - This will update all dependent packages to point to the `<next>-0` prerelease version of the dependency (`<next>` should match what's in the local dependency's `package.json`). The `--local` prevents it from doing `npm i` afterwards, which may fail if there's no published package matching the new dependency version. Note this also means you will no longer be able to run `npm i` if you change dependencies as part of local validation until the new dependency versions are available.
    - Heads up: this commits the `package.json` changes on a new branch
1. `fluid-build --symlink:full` - This will traverse the dependency graph finding all pre-release dependencies and replace the installed package in `node_modules` with a symlink to the local package's build output
1. `fluid-build` - This will build all the client packages (or use the equivalent command for server or whatever you'd like). You can make further changes to the dependency and they'll immediately be reflected when rebuilding the downstream cross-boundary packages. Yay!
1. To undo the symlinking, run `fluid-build --symlink` which will isolate the different parts of the repo as usual. When you're done you'll want to switch back to your regular branch, ditching the commit from `fluid-bump-version`.

If something goes awry, just start over and try again, you can snoop around your repo at each step to make sure it looks the way you expect.

### Using pre-release versions to fully incorporate your change before a release

Suppose you are making a change to @fluidframework/container-definitions and intend for the client packages to consume it in the next release. We'll say container-definitions will next release version 0.43.0 and client will next release version 0.53.0.

Once you've tested your changes locally using `symlink:full` as described above and checked in the changes to container-definitions, it's time to publish a pre-release version containing your changes. This requires a member of the core team of maintainers at Microsoft to manually trigger the pre-release pipeline, which will push a package version like 0.43.0-12345 to npmjs.org.

Once this is complete, use `fluid-bump-version -d <dependency-you-changed>` (same as above, just without `--local`) to update dependent packages to specify the pre-release version. Then run `npm i` or `fluid-build --install` to update the lock files with the specific pre-release version. Note that `package.json` files will specify the dependency range as `"^0.43.0-0"`, so if someone has _already updated_ the dependencies to pre-release, you'll need to manually ensure the lockfile updates to the specific pre-release version that contains your changes.

Now that your changes are published on npm, and your downstream dependent packages are consuming that version, you can build the repo, fix any breaks (in the case of a breaking change), and make whatever other changes you'd like. Then publish a PR to merge the new pre-release dependency version and related changes into main. When the next release is cut, container-definitions version 0.43.0 will be published, and the client code will be updated to depend on that version, and all will be well. Without walking the change through pre-release, any breaking change will cause a build break during the release.
