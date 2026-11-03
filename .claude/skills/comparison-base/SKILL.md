---
name: comparison-base
description: Internal reusable workflow for resolving the correct Git comparison base for branch reviews and change analysis. Finds the PR target or canonical Fluid Framework upstream, selects the newest shared target-history commit, and detects substantial divergence.
argument-hint: "[review-ref]"
---

# Comparison Base Resolution

Use this skill when another workflow needs to compare a branch or working tree with the branch it is intended to merge into. This skill resolves the comparison refs and commit; the caller decides what paths and endpoint to diff.

## Inputs

- `$REVIEW_REF`: the commit being reviewed. Default to `HEAD`.

Set `$IS_LOCAL_REVIEW=true` when the input is `HEAD`, or when a named local branch is the currently checked-out branch; otherwise set it to `false`. Callers use this explicit value to decide whether workspace changes belong to the review.

For `HEAD` or a named review branch, record `$REVIEW_BRANCH` when the ref identifies a local branch. Resolve its published destination using Git's push precedence: `branch.<name>.pushRemote`, then `remote.pushDefault`, then the branch's configured upstream remote. Store the remote name or URL usable by Git as `$REVIEW_FETCH_SOURCE`, normalize that remote's GitHub URL to `owner/repository` as `$REVIEW_REPOSITORY`, and store the remote branch name as `$REVIEW_HEAD_BRANCH`. Keep these values distinct: Git commands consume `$REVIEW_FETCH_SOURCE`, while GitHub PR metadata uses `$REVIEW_REPOSITORY`. The published branch may have a different name from the local branch. Without any configured destination, inspect configured remotes for an exact `$REVIEW_BRANCH` match and derive all three values; ask the user if multiple remotes match. A detached `HEAD`, commit input, or unpublished local branch may leave the published identity unset.

For a named review branch, prefer an exact local branch and set `REVIEW_REF=refs/heads/$REVIEW_BRANCH`. If there is no local branch and exactly one remote matches, set `$REVIEW_FETCH_SOURCE` to that remote, derive `$REVIEW_REPOSITORY` from its URL, set `$REVIEW_HEAD_BRANCH=$REVIEW_BRANCH`, fetch the branch into a dedicated ref, and use that ref as `$REVIEW_REF`:

```bash
git fetch --no-tags "$REVIEW_FETCH_SOURCE" "+refs/heads/$REVIEW_BRANCH:refs/comparison/head"
REVIEW_REF=refs/comparison/head
```

If the branch is absent, ask the user for another review ref. If it exists on multiple remotes and has no configured upstream or push remote, ask the user which remote to assign to `$REVIEW_FETCH_SOURCE`, derive `$REVIEW_REPOSITORY`, then fetch it as shown above. Finally, set `$REVIEW_OID`:

```bash
REVIEW_OID=$(git rev-parse "$REVIEW_REF")
```

## Step 1: Resolve the target branch

Resolve an open PR using the following sources in order, stopping as soon as one source produces exactly one validated match. Do not query later sources after a match is resolved.

1. Prefer active PR metadata already available from the editor's PR integration. Verify its head repository and branch match `$REVIEW_REPOSITORY` and `$REVIEW_HEAD_BRANCH` when those values are known. Its published head must also match `$REVIEW_OID` or be an ancestor of a locally-ahead `$REVIEW_REF`.
2. If no match was resolved and `$REVIEW_REPOSITORY` and `$REVIEW_HEAD_BRANCH` are known, query open PRs by branch. `gh pr list --repo <candidate-base-repository> --state open --head "$REVIEW_HEAD_BRANCH" --json url,state,baseRefName,headRefName,headRefOid,headRepository` is convenient; query GitHub repositories named by configured remotes, including `microsoft/FluidFramework`, one at a time and stop after a validated match. Validate `headRepository.nameWithOwner` against `$REVIEW_REPOSITORY`. This branch query lets a locally-ahead commit resolve its published PR.
3. If still unresolved, query the GitHub commit-to-PR API (`repos/{owner}/{repo}/commits/$REVIEW_OID/pulls`) for the same candidate repositories, one at a time, and stop after a validated match. Treat HTTP 404 or 422 as no candidates and continue; locally-ahead or unpublished commits may not exist in the queried repository.

From any source, read the PR state and URL, base repository and branch, and head repository, branch, and SHA. Only accept open PRs whose head repository and branch match the known review identity and whose head SHA matches `$REVIEW_OID` or is its ancestor.

Do not rely on bare `gh pr view`, bare `gh repo view`, or an unqualified repository context. These are ambiguous in fork checkouts; pass an explicit PR URL or `--repo owner/repository`. If multiple open PRs match, ask the user which PR to use.

For a matching PR, set:

- `$TARGET_SOURCE` to its base repository clone URL
- `$TARGET_REPOSITORY` to its normalized `owner/repository` name
- `$TARGET_BRANCH` to its base branch
- `$PR_URL` to its HTML URL

If no PR exists, inspect fetch remotes and select one whose normalized URL points to `https://github.com/microsoft/FluidFramework` (accept SSH or HTTPS and an optional `.git` suffix). Set `$TARGET_SOURCE` to that remote, `$TARGET_REPOSITORY` to `microsoft/FluidFramework`, and `$TARGET_BRANCH` to `main`. If no such remote exists, use `https://github.com/microsoft/FluidFramework.git` directly as `$TARGET_SOURCE` and set the other values the same way.

Fetch the target branch into a dedicated ref so stale or unrelated tracking branches cannot affect the result:

```bash
git fetch --no-tags "$TARGET_SOURCE" "+refs/heads/$TARGET_BRANCH:refs/comparison/target"
TARGET_REF=refs/comparison/target
```

## Step 2: Select the comparison commit

Find all best common ancestors of the target and review refs. Fluid Framework squash-merges branches into `main`, so this normally produces exactly one commit. Use `--all` so Git reports criss-cross or other ambiguous histories instead of selecting an arbitrary best ancestor.

```bash
if BASE_COMMITS=$(git merge-base --all "$TARGET_REF" "$REVIEW_REF"); then
  BASE_STATUS=0
else
  BASE_STATUS=$?
fi
```

If `$BASE_STATUS` is nonzero, report the Git failure. If `$BASE_COMMITS` is empty, check `git rev-parse --is-shallow-repository`. For a shallow repository, deepen the target and review histories from their respective fetch sources and retry; unshallow when practical. Only ask the user for a comparison commit after the repository is confirmed complete or deepening cannot recover the shared history.

If exactly one commit was returned, set `$BASE_COMMIT` to it. If multiple commits were returned, show each commit's short SHA, date, and subject, explain that Git found multiple equally good common ancestors, and ask the user which one to use.

Verify `$BASE_COMMIT` is non-empty and is an ancestor of both `$TARGET_REF` and `$REVIEW_REF` before continuing.

## Step 3: Check divergence

Count all commits reachable from each tip after the selected comparison commit:

```bash
REVIEW_COMMITS=$(git rev-list --count "$BASE_COMMIT..$REVIEW_REF")
TARGET_COMMITS=$(git rev-list --count "$BASE_COMMIT..$TARGET_REF")
```

Record the comparison commit's short SHA, date, and subject; both tip dates; and the elapsed time from the comparison commit to each tip.

If either count is greater than 50, stop before the caller reads diffs. Warn that the histories have substantial divergence and show:

- selected target repository and branch
- selected comparison commit (short SHA, date, and subject)
- review side: commit count, tip date, and elapsed time since the comparison commit
- target side: commit count, tip date, and elapsed time since the comparison commit

Ask whether to continue with these values, choose another target branch, or choose another comparison commit. When `$TARGET_COMMITS` is nonzero, also offer to merge the target branch into the review branch first. Explain that merging can reduce target-side divergence but modifies the review branch; never perform it without explicit approval.

## Outputs

Return these values to the caller:

- `$REVIEW_REF`, `$REVIEW_OID`, and `$IS_LOCAL_REVIEW`
- `$REVIEW_FETCH_SOURCE`, `$REVIEW_REPOSITORY`, and `$REVIEW_HEAD_BRANCH`, when a published review identity was resolved
- `$TARGET_SOURCE`, `$TARGET_REPOSITORY`, `$TARGET_BRANCH`, and `$TARGET_REF`
- `$BASE_COMMIT`
- `$REVIEW_COMMITS` and `$TARGET_COMMITS`
- `$PR_URL`, if a PR was found
- recorded commit and elapsed-time metadata

The caller must use the exact selected `$BASE_COMMIT`; it must not later replace it with a three-dot diff or recompute a merge-base.

## Edge Cases

- Ambiguous PR or named branch: ask the user which one to use.
- Multiple best common ancestors: show them and ask the user which one to use.
- Empty base in a shallow repository: deepen both relevant histories and retry before treating them as unrelated.
- No shared target-history commit: ask the user for a comparison commit.
- More than 50 commits on either side: present divergence and ask before proceeding.
