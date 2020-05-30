# Stylistic code formatting

The Fluid Framework repo codebase follows a consistent style. This is enforced by local linting and CI/CD tests, but
this enforcement shouldn't get in your way. The following scenarios illustrate how to use the tools in the repo to
ensure your code changes are formatted properly prior to submitting a PR.

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
