`flub merge`
============

Sync branches depending on the batch size passed

* [`flub merge branches`](#flub-merge-branches)

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
