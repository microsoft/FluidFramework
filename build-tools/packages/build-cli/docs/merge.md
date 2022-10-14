`flub merge`
============

Sync branches depending on the batch size passed

* [`flub merge branches`](#flub-merge-branches)
* [`flub merge info`](#flub-merge-info)

## `flub merge branches`

Sync branches depending on the batch size passed

```
USAGE
  $ flub merge branches -a <value> -s <value> -t <value> -b <value> [-p <value>] [-v]

FLAGS
  -a, --auth=<value>                (required) GitHub authentication token
  -b, --batchSize=<value>           (required) Maximum number of commits to include in the pull request
  -p, --pullRequestInfo=<value>...  Pull request data
  -s, --source=<value>              (required) Source branch name
  -t, --target=<value>              (required) Target branch name
  -v, --verbose                     Verbose logging.

DESCRIPTION
  Sync branches depending on the batch size passed
```

## `flub merge info`

Get info about the merge status of branches in the repo. Uses "main" and "next" if no branch names are provided. Output the data as JSON using --json.

```
USAGE
  $ flub merge info [--json] [-b <value>] [-v]

FLAGS
  -b, --branch=<value>...  A branch name. Use this argument multiple times to provide multiple branch names.
  -v, --verbose            Verbose logging.

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
