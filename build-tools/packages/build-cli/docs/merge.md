`flub merge`
============

Sync branches depending on the batch size passed

* [`flub merge branches`](#flub-merge-branches)
* [`flub merge info`](#flub-merge-info)

## `flub merge branches`

Sync branches depending on the batch size passed

```
USAGE
  $ flub merge branches -p <value> -s <value> -t <value> -b <value> --reviewers <value>... [-v | --quiet] [-r
    <value>]

FLAGS
  -b, --batchSize=<value>     (required) Maximum number of commits to include in the pull request
  -p, --pat=<value>           (required) GitHub Personal Access Token. This parameter should be passed using the
                              GITHUB_PAT environment variable for security purposes.
  -r, --remote=<value>        The name of the upstream remote to use to check for PRs. If not provided, the remote
                              matching the microsoft/FluidFramework repo will be used.
  -s, --source=<value>        (required) Source branch name
  -t, --target=<value>        (required) Target branch name
      --reviewers=<value>...  (required) Add reviewers to PR

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Sync branches depending on the batch size passed
```

_See code: [src/commands/merge/branches.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/merge/branches.ts)_

## `flub merge info`

Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided. Output the data as JSON using --json.

```
USAGE
  $ flub merge info [--json] [-v | --quiet] [-b <value>...]

FLAGS
  -b, --branch=<value>...  A branch name. Use this argument multiple times to provide multiple branch names.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided.
  Output the data as JSON using --json.

EXAMPLES
  Get info about the merge status of the main and next branch in the repo.

    $ flub merge info

  Output the merge status as JSON using --json.

    $ flub merge info --json
```

_See code: [src/commands/merge/info.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/merge/info.ts)_
