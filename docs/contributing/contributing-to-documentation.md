# Contributing to documentation

## Contributing API documentation

Simply add TSDoc comments to the source code; those will be automatically pulled out and included in the published
documentation.You can do a local build using DocFX if you want to see how things look before you push.

## Editing an existing documentation file

The docs include an "Improve this Doc" button that will navigate you to the Markdown file in GitHub, where you can
edit it directly and create a PR with the changes if needed.

## Adding a brand new topic (i.e. a Markdown file)

There are two steps to adding a completely new file: Adding the file, and updating the TOC to include it. Adding
the file is simple; just place a new Markdown file in the `docs` folder. Then update the `toc.yml` file in the
docs folder to include a link to your new file.

## Add a new section (i.e. a 'hub' for multiple topics)

Similar to adding a new file, adding a new section takes multiple steps. First, you add a new folder for the section,
then create an `index.md` and `toc.yml` file within it. Finally, you need to update the root `toc.yml` file to
include the new section.
