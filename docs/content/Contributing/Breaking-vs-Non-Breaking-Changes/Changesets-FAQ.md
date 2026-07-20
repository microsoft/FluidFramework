# Common Questions about Changesets

## Changesets are markdown files with YAML front matter

The two parts of the file are for different purposes. You should feel free to edit both parts as much as you want.

- The markdown text is a summary of the changes that will be prepended to the package changelog during a release.
- The YAML front matter describes what packages are affected by the change represented by the changeset. Each package listed here will have the changeset content added to its changelog during release.

## How are the changeset file names chosen? Do they mean anything? Can I rename them?

Changeset filenames are automatically generated. You can create one using the `pnpm changeset` command. The file names themselves are meaningless; you can rename them or pick your own name if you want.

## Changesets are automatically removed during release

When we do a release, all the changeset files for the release are removed. This is so we only ever use a changeset once. This makes this a very bad place to store any other information.

## I want to edit the summary or package bump types - is it safe to do that?

Editing the summary or packages that are affected is safe. You can even write changesets without the command if you want. Note that the change type for our repo is determined by the target branch, so all changesets on a given branch should have the same change type.

## Can I manually delete changesets?

You can, but you should be aware this will remove the intent to release communicated by the changeset, so should be done with caution.
