When PRs are submitted to the FluidFramework repo, reviewers are automatically assigned to the PR using a [GitHub action.](https://github.com/shufo/auto-assign-reviewer-by-files)

The PR assignments are based on the mappings in the [.github/code-owners.yml](https://github.com/microsoft/FluidFramework/blob/main/.github/code_owners.yml) in the repo. Each entry is a glob path followed by the GitHub usernames of people that should be added as reviewers. If any files under the glob path have changed, then the reviewers in that entry will be added. **All reviewers are always added.**

If you want to adjust the code reviewers, edit [.github/code-owners.yml](https://github.com/microsoft/FluidFramework/blob/main/.github/code_owners.yml) and open a PR. See [PR #5125](https://github.com/microsoft/FluidFramework/pull/5125) for an example.
