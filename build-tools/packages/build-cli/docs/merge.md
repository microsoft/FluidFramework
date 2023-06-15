`flub merge`
============

Sync branches depending on the batch size passed

* [`flub merge branches`](#flub-merge-branches)
* [`flub merge info`](#flub-merge-info)

## `flub merge branches`

Sync branches depending on the batch size passed

```
USAGE
  $ flub merge branches -a <value> -s <value> -t <value> -b <value> [-v] [-r <value>]

FLAGS
  -a, --auth=<value>       (required) GitHub authentication token. For security reasons, this value should be passed
                           using the GITHUB_TOKEN environment variable.
  -b, --batchSize=<value>  (required) Maximum number of commits to include in the pull request
  -r, --remote=<value>     [default: origin]
  -s, --source=<value>     (required) Source branch name
  -t, --target=<value>     (required) Target branch name

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Sync branches depending on the batch size passed
```

## `flub merge info`

Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided. Output the data as JSON using --json.

```
USAGE
  $ flub merge info [-v] [--json] [-b <value>]

FLAGS
  -b, --branch=<value>...  A branch name. Use this argument multiple times to provide multiple branch names.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.
  --json         Format output as json.

DESCRIPTION
  Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided.
  Output the data as JSON using --json.

EXAMPLES
  Get info about the merge status of the main and next branch in the repo.

    $ flub merge info

  Output the merge status as JSON using --json.

    $ flub merge info --json
```
