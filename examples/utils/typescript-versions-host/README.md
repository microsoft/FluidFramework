# @fluid-example/typescript-versions-host

This package provides a collection of different versions of typescript packages.

Dependents may enumerate packages installed by this package looking for `typescript-<major>.<minor>` packages.

No one should access the `bin` folder for this package as the installed `tsc`/`tsserver` entries are unstable (at least this package does not prescribe that a specific version is expected to be setup).

### Future Suggestions

If more consumers of this pattern are found, consider creating utility within this package to provide enumeration and access in a uniform manner.
