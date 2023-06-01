# @fluid-internal/changelog-generator

This tool is used to transform changesets into CHANGELOG.md entries. It uses the extensibility that the default
changesets tools provide, which is documented here:
<https://github.com/changesets/changesets/blob/main/docs/modifying-changelog-format.md>

Unfortunately the APIs are not well documented, so this tool builds on top of another formatter,
[changesets-format-with-issue-links](https://github.com/spautz/changesets-changelog-format). The only changes we've made
to that formatter is to ignore changelog entries that are only due to dependency updates. The changelog files are then
manually fixed up using find/replace.

## Generating changelogs for release

To generate changelogs for a release, use the steps below. These instructions assume @fluid-internal/changelog-generator
has been built, which should happen automatically when running `pnpm i` in the root.

1. Install [sd](https://github.com/chmln/sd).
1. Run `pnpm i` from the repo root.
1. Run `pnpm exec changeset version`. This will consume the changeset files and
1. Run `git add .changeset`.
1. Run `pnpm -r exec -- sd "## 2.0.0\n" "## [RELEASE VERSION]\n" CHANGELOG.md`
1. Run `pnpm -r exec -- sd "## [RELEASE VERSION]\n\n## " "## [RELEASE VERSION]\n\nDependency updates only.\n\n## " CHANGELOG.md`
1. `pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md`
1. `git restore .`
1. `git clean -df`
1. Commit and open a PR!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
