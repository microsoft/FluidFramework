# Dev Tools Maintenance

## Typescript

Periodically we'll want to update the version of TSC used to build our code.
One consideration first is: Are there changes that would require downstream consumers of our libraries to also upgrade their version of TS?
This has bitten us (and our partners) in the past (see [this BREAKING.md entry](https://github.com/microsoft/FluidFramework/commit/f82c1f3f21ebe2b8713197e037299720110962fd)), so double-check for breaking changes like that in the release notes.
Assuming you go forward, the basic steps are:

1. Edit the version in the package.json files across the repo.
2. Run a clean npm i across all the packages including the server ( build:fast -- --symlink:full --install is helpful)
3. Commit lock file and package.json changes.
4. Ensure tests pass, etc.
5. PR it.

The challenge will be in step 4. It's tough to say how many code or config changes might be needed across the repo.
It might be trivial, but it really depends.
Regardless, try to get your PR merged quickly though because lockfile changes are difficult to keep current.

This is also assuming you do not need to update the shared tsconfig in build-common in order to build with the new TSC.
If you do, then the dance will be more complex.
