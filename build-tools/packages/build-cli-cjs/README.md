build-cli-cjs
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/build-cli-cjs.svg)](https://npmjs.org/package/build-cli-cjs)
[![Downloads/week](https://img.shields.io/npm/dw/build-cli-cjs.svg)](https://npmjs.org/package/build-cli-cjs)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g build-cli-cjs
$ flub-cjs COMMAND
running command...
$ flub-cjs (--version)
build-cli-cjs/0.0.0 linux-x64 node-v18.18.2
$ flub-cjs --help [COMMAND]
USAGE
  $ flub-cjs COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`flub-cjs hello PERSON`](#flub-cjs-hello-person)
* [`flub-cjs hello world`](#flub-cjs-hello-world)
* [`flub-cjs help [COMMAND]`](#flub-cjs-help-command)
* [`flub-cjs plugins`](#flub-cjs-plugins)
* [`flub-cjs plugins add PLUGIN`](#flub-cjs-plugins-add-plugin)
* [`flub-cjs plugins:inspect PLUGIN...`](#flub-cjs-pluginsinspect-plugin)
* [`flub-cjs plugins install PLUGIN`](#flub-cjs-plugins-install-plugin)
* [`flub-cjs plugins link PATH`](#flub-cjs-plugins-link-path)
* [`flub-cjs plugins remove [PLUGIN]`](#flub-cjs-plugins-remove-plugin)
* [`flub-cjs plugins reset`](#flub-cjs-plugins-reset)
* [`flub-cjs plugins uninstall [PLUGIN]`](#flub-cjs-plugins-uninstall-plugin)
* [`flub-cjs plugins unlink [PLUGIN]`](#flub-cjs-plugins-unlink-plugin)
* [`flub-cjs plugins update`](#flub-cjs-plugins-update)

## `flub-cjs hello PERSON`

Say hello

```
USAGE
  $ flub-cjs hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ flub-cjs hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/packages/build-cli-cjs/blob/v0.0.0/src/commands/hello/index.ts)_

## `flub-cjs hello world`

Say hello world

```
USAGE
  $ flub-cjs hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ flub-cjs hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/packages/build-cli-cjs/blob/v0.0.0/src/commands/hello/world.ts)_

## `flub-cjs help [COMMAND]`

Display help for flub-cjs.

```
USAGE
  $ flub-cjs help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for flub-cjs.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.20/src/commands/help.ts)_

## `flub-cjs plugins`

List installed plugins.

```
USAGE
  $ flub-cjs plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ flub-cjs plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/index.ts)_

## `flub-cjs plugins add PLUGIN`

Installs a plugin into flub-cjs.

```
USAGE
  $ flub-cjs plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into flub-cjs.

  Uses bundled npm executable to install plugins into /home/tylerbu/.local/share/flub-cjs

  Installation of a user-installed plugin will override a core plugin.

  Use the FLUB_CJS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the FLUB_CJS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ flub-cjs plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ flub-cjs plugins add myplugin

  Install a plugin from a github url.

    $ flub-cjs plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ flub-cjs plugins add someuser/someplugin
```

## `flub-cjs plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ flub-cjs plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ flub-cjs plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/inspect.ts)_

## `flub-cjs plugins install PLUGIN`

Installs a plugin into flub-cjs.

```
USAGE
  $ flub-cjs plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into flub-cjs.

  Uses bundled npm executable to install plugins into /home/tylerbu/.local/share/flub-cjs

  Installation of a user-installed plugin will override a core plugin.

  Use the FLUB_CJS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the FLUB_CJS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ flub-cjs plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ flub-cjs plugins install myplugin

  Install a plugin from a github url.

    $ flub-cjs plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ flub-cjs plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/install.ts)_

## `flub-cjs plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ flub-cjs plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ flub-cjs plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/link.ts)_

## `flub-cjs plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ flub-cjs plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub-cjs plugins unlink
  $ flub-cjs plugins remove

EXAMPLES
  $ flub-cjs plugins remove myplugin
```

## `flub-cjs plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ flub-cjs plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/reset.ts)_

## `flub-cjs plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ flub-cjs plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub-cjs plugins unlink
  $ flub-cjs plugins remove

EXAMPLES
  $ flub-cjs plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/uninstall.ts)_

## `flub-cjs plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ flub-cjs plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub-cjs plugins unlink
  $ flub-cjs plugins remove

EXAMPLES
  $ flub-cjs plugins unlink myplugin
```

## `flub-cjs plugins update`

Update installed plugins.

```
USAGE
  $ flub-cjs plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/update.ts)_
<!-- commandsstop -->
