`flub transform`
================

Transform commands are used to transform code, docs, etc. into alternative forms.

* [`flub transform releaseNotes`](#flub-transform-releasenotes)

## `flub transform releaseNotes`

Transforms a markdown release notes file into a format appropriate for use in a GitHub Release. This is used to transform in-repo release notes such that they can be automatically posted to our GitHub Releases.

```
USAGE
  $ flub transform releaseNotes --inFile <value> --outFile <value> [-v | --quiet]

FLAGS
  --inFile=<value>   (required) A release notes file that was generated using 'flub generate releaseNotes'.
  --outFile=<value>  (required) Output the transformed content to this file.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

EXAMPLES
  Transform the release notes from version 2.2.0 and output the results to out.md.

    $ flub transform releaseNotes --inFile RELEASE_NOTES/2.2.0.md --outFile out.md
```

_See code: [src/commands/transform/releaseNotes.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/transform/releaseNotes.ts)_
