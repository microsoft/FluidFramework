---
"@fluid-tools/build-cli": minor
"__section": fix
---
Preserve independent package versions in unreleased release reports

The `flub release report-unreleased` command now selects packages by release-group membership instead of version equality.
Only packages in the target release group, which defaults to `client`, receive the build version.
Independent packages and other release groups retain their input versions, even when those versions match the target group's version.
Explicit `--releaseGroup` filtering is unchanged.
The command reports an error if the input report has no entries with the target release group.
