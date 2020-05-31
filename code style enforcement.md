# Stylistic code formatting

The Fluid Framework repo codebase follows a consistent style. This is enforced by local linting and CI/CD tests, but
this enforcement shouldn't get in your way. The following scenarios illustrate how to use the tools in the repo to
ensure your code changes are formatted properly prior to submitting a PR.

## Scenario

Christian wants to fix a bug in Fluid Framework. He has an outdated clone of the repository from an earlier bug fix, but
it's a few months out of date.

To get started as quickly as possible, Christian pulls the latest `master` branch, and uses the following commands to get
his local repo in a good state:

    npm install
    npm run build:fast -- --no-lint

He uses the `--no-lint` option to skip linting the code since he has made no local changes at this point. `build:fast`
invokes the Fluid build tool, which intelligently builds only what is outdated.

Once his local clone has built, he creates a new branch, `bug-fix`, and opens the repo in VSCode to start making code
changes. VSCode prompts him to consider installing some recommended extensions for linting and code formatting, which he
does.

After making his first change, he commits it as he typically does. He then builds and lints his changes using
`npm run build:fast`. Once things look good locally, he pushes his changes using `git push`. However, one of the files
he's changed has a formatting issue, so the push is aborted by the repo's `pre-push` git hook.

To quickly address the formatting problem, Christian uses the `pr-check` script:

    npm run pr-check

This script fixes the formatting issue, so Christian commits the result and attempts to push again. This time, the push
is successful.

To help ensure that formatting and linting issues are fixed automatically in the future, Christian configures VSCode to
automatically apply the formatting and linting changes on save.

## VSCode

### Extensions

For code formatting, we recommend installing both the [editorconfig][] and [tsfmt][] extensions for VSCode. Once
installed, they will ensure your default code formatting styles are configured properly. You should install both,
because editorconfig applies to all files while tsfmt only formats TypeScript files.

For linting support, you should install the [ESLint extension][ESLint].

### Formatting code on save

**To format code on save**, set the `editor.formatOnSave` setting in VSCode to `true`.

To apply ESLint auto-fixes on save, you can use the VSCode `editor.codeActionsOnSave` setting. The setting below turns
on auto-fix for all providers including ESLint:

```json
"editor.codeActionsOnSave": {
    "source.fixAll": true
}
```

In contrast, this configuration only turns it on for ESLint:

```json
"editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
}
```

You can also selectively disable ESLint via:

```json
"editor.codeActionsOnSave": {
    "source.fixAll": true,
    "source.fixAll.eslint": false
}
```

## Other code editors

Check if there are [editorconfig plugins](https://editorconfig.org/#download) and [ESLint
plugins](https://eslint.org/docs/user-guide/integrations#editors) for your editor and install them.

## Git commit hooks

Whenever you attempt to push your branch, a `pre-push` git hook will check that all files modified in the branch
(compared to `master`) are formatted properly.

If the branch contains changes to `package.json` files, the `policy-check` task will be run to validate that the files
are sorted properly.

If the branch contains changes to any `ts` or `tsx` files, those files will be checked for proper formatting.

If the push fails because of formatting issues, you can auto-format the files using `npm run pr-check`. **No changes
will be made by the git hook.**

If you need to skip the hooks altogether, pass the `--no-verify` option to the git command. For example:

```
git push --no-verify
```

Note that CI/CD will still validate the files, and changes won't be merged in until CI/CD issues are addressed.

## Manually running code format fixup

You can auto-fix most formatting and linting issues using the following commands:

```
npm run build:fast -- -s lint:fix
npm run pr-check
```

<!-- Links -->
[editorconfig]: https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig
[ESLint]: https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint
[tsfmt]: https://marketplace.visualstudio.com/items?itemName=eternalphane.tsfmt-vscode
