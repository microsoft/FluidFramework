# @fluid-internal/auspkn

Provides REST API access to npm package contents, targeted the internal Azure DevOps (VSTS) feed endpoint prior to open sourcing.

## NPM Repositories

### VSTS

To update the config.json to target a repository stored in VSTS follow the usual steps to configure access to
a repository. But rather than using the base 64 encoded personal access token as the password just include
the original personal access token directly.
