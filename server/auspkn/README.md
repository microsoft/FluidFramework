# @fluid-internal/auspkn

[![Auspkn Build Status](https://offnet.visualstudio.com/officenet/_apis/build/status/server/server%20-%20auspkn?branchName=master)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=25)

Provides REST API access to npm package contents, targeting the internal Azure DevOps (VSTS) feed endpoint today.

## NPM Repositories

### VSTS

To update the config.json to target a repository stored in VSTS follow the usual steps to configure access to
a repository. But rather than using the base 64 encoded personal access token as the password just include
the original personal access token directly.
