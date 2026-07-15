# @fluidframework/test-tools

## vNext

## 2.1.0

-   Added a `with-test-port` executable that runs a command with the current package's assigned test port made
    available to it: the resolved port is exported to the command's environment as `PORT` and substituted for any
    `{PORT}` tokens in the command. This lets service tests that launch their own server from a `package.json`
    script (for example via `start-server-and-test`) run concurrently across packages without colliding on a
    shared port, the same way jest/puppeteer tests already use `getTestPort`. An optional leading
    `--fallback <number>` option sets the port used when `assign-test-ports` has not run, so it can be
    aligned with the default port the launched server uses. See the README for details.
-   `getTestPort` now returns a `number` instead of a `string`. The values in the generated port mapping were
    already numeric, so this only corrects the (previously inaccurate) return type and the default value; callers
    that wrapped the result in `parseInt`/`Number` can drop that conversion. Consumers that assign the result to
    `process.env` or interpolate it into a string are unaffected.
-   `getTestPort` now accepts an optional `fallbackPort` argument (default `8081`) that is returned when no
    assigned port is found (no mapping file, or no entry for the package). This lets callers align the fallback
    with the default port their server uses when tests are run without `assign-test-ports`.

## 2.0.0

-   Dependency updates.

### ⚠ BREAKING CHANGES

-   Update `typescript` dependency from `4.x` to `5.x`.
-   Initial port for package-to-test-port mapping is now 9000 instead of 8081.
