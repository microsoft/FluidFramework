# @fluidframework/test-tools

Tools to help with testing

## `assign-test-ports` executable

Used to assign unique ports to jest/puppeteer tests so that they do not need to be hardcoded into config files,
and so writers of new tests do not need to manually find the next available port.
This is necessary because during CI, jest tests from all packages that have them are run concurrently (for performance),
so ports may not be re-used.

`assign-test-ports` will use port 9000 as the default initial port in its mapping from packages to test ports.
The number of ports it will use depends on the number of packages in the pnpm workspace from which it is invoked.
If an integer number is passed to it as the first command line argument, it will use that as the initial port instead.

## `with-test-port` executable

Runs a command with the current package's assigned test port made available to it.
This is useful for service tests that launch their own server from a `package.json` script (for example via
`start-server-and-test`), where the port is needed in the shell/script context rather than in JavaScript as
jest/puppeteer configs consume it via `getTestPort`.

`with-test-port <command...>` resolves the port for the current package (using the `name` field of the
`package.json` in the working directory, the same mapping written by `assign-test-ports`) and then runs the
given command with every `{PORT}` token in the command replaced with the resolved port.

For example, the following runs a real-service test against a Tinylicious server on the package's assigned port
without hardcoding it, letting packages run their service tests concurrently without colliding on a shared port:

```
with-test-port --fallback 7070 start-server-and-test start:tinylicious:test {PORT} test:realsvc:tinylicious:run
```

If `assign-test-ports` has not been called, no port is assigned; the optional leading `--fallback <number>`
option controls the port used in that case (defaulting to `getTestPort`'s default). Set it to match the default
port the launched server uses so the server and any test client resolve the same port — in the example above,
`7070` is Tinylicious's default port.

## getTestPort.ts

Packages can import this package and call this function (which is a named export) to get a unique port they can use
to run their jest/puppeteer tests.
If `assign-test-ports` has been called, the function will return the port assigned to the package.
Otherwise it will return a fallback port, which can be provided as an optional second argument
(`getTestPort(packageName, fallbackPort)`) and defaults to `8081`.
