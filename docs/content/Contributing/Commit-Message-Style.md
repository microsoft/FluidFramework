# Commit Message Style

_Note: this is currently only enforced for the build-tools release group.
But you can follow this style elsewhere!_

We use the [conventional commit format](https://conventionalcommits.org/) in the build-tools release group.
This lets us autogenerate changelogs and more easily write release notes.

Because we use the "squash merge" workflow for most of our branches, the PR title and body become the commit title and message, respectively.
For this reason, we run a required check in CI that verifies PR titles adhere to the standard as configured in the repo.

## The format

The conventional commits format looks like this:

```text
type(scope?): subject  #scope is optional but recommended; multiple scopes are supported
```

Valid types are:

TODO

For scope, use the following:

TODO

## PR template content

Our PR template contains sections that are meant to be removed.
We check that these sections are not in the PR message.
