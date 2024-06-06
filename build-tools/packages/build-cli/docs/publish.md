`flub publish`
==============

Publish commands are used to publish packages to an npm registry.

* [`flub publish tarballs`](#flub-publish-tarballs)

## `flub publish tarballs`

Publishes tarballs to the package registry unless the version is already published.

```
USAGE
  $ flub publish tarballs --orderFile <value> [-v | --quiet] [--dir <value>] [--tarball] [--retry <value>] [--dryRun]
    [--access public|restricted] [--publishArgs <value>]

FLAGS
  --access=<option>      This flag will be passed to 'npm publish'.
                         <options: public|restricted>
  --dir=<value>          [default: .] A directory containing tarballs to publish. Tarballs must have the file extension
                         tgz.
  --dryRun               Does everything except publish to the registry. This flag will be passed to 'npm publish'.
  --orderFile=<value>    (required) A file with package names that should be published. Such files can be created using
                         `flub list`.
  --publishArgs=<value>  This string will be passed to 'npm publish' verbatim. Use this to pass additional custom args
                         to npm publish like --tag.
  --retry=<value>        Number of times to retry publishing a package that fails to publish.
  --tarball              Use this flag to indicate that the orderFile contains tarball names instead of package names.
                         Such files can be created using `flub list --tarball`. This option is deprecated and for
                         backwards compatibility only.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Publishes tarballs to the package registry unless the version is already published.

  Used to publish a portion of tarballs from a folder based on an input file. The file can contain package names or
  tarball names.
```

_See code: [src/commands/publish/tarballs.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/publish/tarballs.ts)_
