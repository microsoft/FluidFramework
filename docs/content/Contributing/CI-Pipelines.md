## CI Pipeline for PR Validation

With every commit pushed to an open PR branch, the following CI checks are queued:

- `license/cla` - Ensure you have signed Microsoft's Contributor License Agreement
- `repo-policy-check` - Ensure certain policies around file metadata, naming sorting, etc are adhered to
- Various `Build - ...` checks - Depending on which directories are touched, the corresponding build/test tasks will be run

If a check failed, click the "details" link for the checks. This will take you to a page on GitHub with a bit more information, and a link to the Azure Dev Ops portal where the checks were executed.

### Repo Policy Check

If `repo-policy-check` fails, you can run it locally like this (from the repo root):

```bash
npm run policy-check
```

Some failures can be auto-resolved by running `npm run policy-check:fix`

_Beware that some behaviors (e.g. file path case sensitivities) differ between OS's, so running locally on Windows may yield different results than the Linux CI machines._

### license/cla flakiness

If the `license/cla` check hangs (takes more than about 1 minute), try closing/reopening your PR.

## CI Pipeline for main/release branch Validation

Once a change is merged into `main` or a `release` branch, the CI loop kicks off several builds and other checks, similar to the PR checks. Microsoft employees can view these runs in the [internal build pipelines](https://offnet.visualstudio.com/officenet/_build). To monitor the official build for a particular commit, just look for the pipeline runs labeled something like "Individual CI for main" with the commit message also listed.

Once the relevant build has succeeded, you may update a dependency on the built packages to the pre-release version (ending in `-0`) and run `npm i` at which point you'll be pulling in the pre-release version of the dependency containing the change in question.
