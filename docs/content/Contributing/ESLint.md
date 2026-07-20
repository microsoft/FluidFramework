We use ESLint across all our projects to enforce and encourage higher-quality code.

# Enabling a new rule

## Testing the rule and pre-applying fixes

Before you can enable the rule, you should test it on the current repo to determine how much code churn the rule will cause.
You should also pre-apply fixes for the rule so that the final integration of the updated config is easier.

### Configure a dev/test environment

One easy way to get started is to create a Codespace, but you can also use any existing repo clone.

1. Clone the repo.
1. Run `npm i -g @fluidframework/build-tools@latest` to install the Fluid build tools.
1. Run `fluid-build --reinstall --symlink:full` to install all deps across all projects, and most importantly, symlink your local copy of the shared ESLint config (in [common/build/eslint-config-fluid](../../../common/build/eslint-config-fluid)) to all the projects.
    - It is recommended to double check that the local copy of `@fluidframework/eslint-config-fluid` was actually symlinked as desired.
      If not, it might indicate that local dependencies are out of date.
      If this is the case, a workaround is to update the `version` property in `@fluidframework/eslint-config-fluid`'s package.json to the version used by the other packages in the repository, and re-run the linking step.
      (Just be sure not to check this change in)
1. Enable the new rule in the shared ESLint config (minimal.js as of 2022-05-17).
1. Run `fluid-build -s build:compile -s lint` to build and run lint on all projects.
1. Fix any errors and create a PR!

Example PRs:

- [#10272](https://github.com/microsoft/FluidFramework/pull/10272)

### Enable rule changes across the repo

After your PR is merged, the rule won't actually take effect until you publish a pre-release shared config package then update the repo to use it.

_To be written._

# Upgrading ESLint or plugins

_To be written._
