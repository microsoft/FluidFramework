## 0.21 Breaking changes

- [supportsTags deprecated](#supportstags-deprecated)

### supportsTags deprecated
We are deprecating use of supportsTags and instead going to handle tags directly at the interface of the runtime and
`IContainerContext`. This will allow loggers downstream to be agnostic about whether messages have tags. This will involve a change in `container-definitions`, which is packaged as part of the `build-common` release.
