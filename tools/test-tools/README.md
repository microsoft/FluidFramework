# @fluidframework/test-tools

Tools to help with testing

## assignTestPorts.ts / assign-test-ports executable

Used to assign unique ports to jest/puppeteer tests so that they do not need to be hardcoded into config files,
and so writers of new tests do not need to manually find the next available port.
This is necessary because during CI, jest tests from all packages that have them are run concurrently (for performance),
so ports may not be re-used.

`assign-test-ports` will use port 9000 as the default initial port in its mapping from packages to test ports.
The number of ports it will use depends on the number of packages in the pnpm workspace from which it is invoked.
If an integer number is passed to it as the first command line argument, it will use that as the initial port instead.

## getTestPort.ts

Packages can import this package and call this function (which is a named export) to get a unique port they can use
to run their jest/puppeteer tests.
If `assign-test-ports` has been called, the function will return the port assigned to the package.
Otherwise it will return a default port.
