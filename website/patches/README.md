# Dependency patches

The files in this folder are patches for packages used by the website.
The patches are created using [pnpm patch](https://pnpm.io/cli/patch), and pnpm applies them automatically when installing dependencies.

## Patch details

### linkinator

We patch `linkinator@8.1.0` to prevent incomplete crawls from being reported as successful.
Linkinator records an HTTP 200 response as successful before finishing its body.
If an HTML or CSS body read fails, the crawler task rejects, but the queue silently discards that error.
The command can therefore exit successfully without completing the crawl.
There is no configuration option in this version to propagate those errors.

The patch records rejected crawler tasks and throws the first error after the queue finishes its remaining work.
The error reaches the CLI's existing error handler, causing the check to exit with status 1 instead of reporting success.
Interrupted body reads are not retried; existing request and HTTP status retries are unchanged.

[Link checker tests](../test/unit/linkChecker.test.ts) cover interrupted HTML and CSS responses.
Remove this patch after upgrading to an upstream release that fixes this behavior and passes those regression tests.
