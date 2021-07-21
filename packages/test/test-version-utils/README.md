# @fluidframework/test-version-utils

Provide Fluid APIs in different version for testing.
Separate into Loader/ContainerRuntime/DataObject+DDS category for now.
- getLoaderApi
- getContainerRuntimeApi
- getDataRuntimeApi

All these API returns the current version by default if no arguments is passed.
If a number is provided, a relative version will be computed by adding the number to the minor version number
of the current version, and find the latest patch version. (^0.<current+requested>.0).
If a string is provided, then the string is treated as a specific version or a range of version, and it will
resolve the latest version that matches it.

The legacy version are installed in their own version folder
./../node_modules/.legacy/<version> (current package root's node_module directory).

All legacy package for all API category are installed all at once regardless of what category is requested.
(See `packageList` variable below).

For now, the current version are statically bound to also provide type.  Although it can be switch to
dynamic loading for consistency (or don't want to force the script to be loaded if they are not needed).
Currently, we don't have such scenario yet.

This file also define a mocha hook so that N-1 and N-2 versions are install for our e2e test. This will likely
be split once we move this file to some utils library to be shared with tests outside of the e2e directory.
