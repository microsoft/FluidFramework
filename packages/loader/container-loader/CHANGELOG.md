# @fluidframework/container-loader

## 2.0.0-internal.4.1.0

### Minor Changes

-   Container-loader deprecations ([#14891](https://github.com/microsoft/FluidFramework/pull-requests/14891)) [961e96f3c9](https://github.com/microsoft/FluidFramework/commits/961e96f3c92d1dcf9575e56c703fe1779af5442d)

    The following types in the @fluidframework/container-loader package are not used by, or necessary to use our public api, so will be removed from export in the next major release:

    -   IContainerLoadOptions
    -   IContainerConfig
    -   IPendingContainerState
    -   ISerializableBlobContents
