# @fluid-private/changelog-generator-wrapper

This tool is used to transform changesets into CHANGELOG.md entries. It uses the extensibility that the default
changesets tools provide, which is documented here:
<https://github.com/changesets/changesets/blob/main/docs/modifying-changelog-format.md>

Unfortunately the APIs are not well documented, so this tool builds on top of another formatter,
[changesets-format-with-issue-links](https://github.com/spautz/changesets-changelog-format). The only changes we've made
to that formatter is to ignore changelog entries that are only due to dependency updates. The changelog files are then
fixed up using a custom tool.

## Generating changelogs for release

To generate changelogs for a release, use the steps below. These instructions assume @fluid-internal/changelog-generator
has been built, which should happen automatically when running `pnpm i` in the root.

1. Run `pnpm i` from the repo root.
1. Run `pnpm flub changelog generate --releaseGroup client`
1. Commit and open a PR!

For more information see the build-cli documentation.

## Developer notes

This package is written in JS instead of TypeScript primarily so it doesn't need to be compiled before use. The code is
a wrapper around other implementations, so the code is simple and doesn't benefit much from typing.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
