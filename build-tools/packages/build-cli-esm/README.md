build-cli-esm
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/build-cli-esm.svg)](https://npmjs.org/package/build-cli-esm)
[![Downloads/week](https://img.shields.io/npm/dw/build-cli-esm.svg)](https://npmjs.org/package/build-cli-esm)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g build-cli-esm
$ build-cli-esm COMMAND
running command...
$ build-cli-esm (--version)
build-cli-esm/0.0.0 linux-x64 node-v18.18.2
$ build-cli-esm --help [COMMAND]
USAGE
  $ build-cli-esm COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`build-cli-esm hello PERSON`](#build-cli-esm-hello-person)
* [`build-cli-esm hello world`](#build-cli-esm-hello-world)
* [`build-cli-esm help [COMMAND]`](#build-cli-esm-help-command)
* [`build-cli-esm plugins`](#build-cli-esm-plugins)
* [`build-cli-esm plugins add PLUGIN`](#build-cli-esm-plugins-add-plugin)
* [`build-cli-esm plugins:inspect PLUGIN...`](#build-cli-esm-pluginsinspect-plugin)
* [`build-cli-esm plugins install PLUGIN`](#build-cli-esm-plugins-install-plugin)
* [`build-cli-esm plugins link PATH`](#build-cli-esm-plugins-link-path)
* [`build-cli-esm plugins remove [PLUGIN]`](#build-cli-esm-plugins-remove-plugin)
* [`build-cli-esm plugins reset`](#build-cli-esm-plugins-reset)
* [`build-cli-esm plugins uninstall [PLUGIN]`](#build-cli-esm-plugins-uninstall-plugin)
* [`build-cli-esm plugins unlink [PLUGIN]`](#build-cli-esm-plugins-unlink-plugin)
* [`build-cli-esm plugins update`](#build-cli-esm-plugins-update)

## `build-cli-esm hello PERSON`

Say hello

```
USAGE
  $ build-cli-esm hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ build-cli-esm hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/packages/build-cli-esm/blob/v0.0.0/src/commands/hello/index.ts)_

## `build-cli-esm hello world`

Say hello world

```
USAGE
  $ build-cli-esm hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ build-cli-esm hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/packages/build-cli-esm/blob/v0.0.0/src/commands/hello/world.ts)_

## `build-cli-esm help [COMMAND]`

Display help for build-cli-esm.

```
USAGE
  $ build-cli-esm help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for build-cli-esm.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.20/src/commands/help.ts)_

## `build-cli-esm plugins`

List installed plugins.

```
USAGE
  $ build-cli-esm plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ build-cli-esm plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/index.ts)_

## `build-cli-esm plugins add PLUGIN`

Installs a plugin into build-cli-esm.

```
USAGE
  $ build-cli-esm plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

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
  Installs a plugin into build-cli-esm.

  Uses bundled npm executable to install plugins into /home/tylerbu/.local/share/build-cli-esm

  Installation of a user-installed plugin will override a core plugin.

  Use the BUILD_CLI_ESM_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the BUILD_CLI_ESM_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ build-cli-esm plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ build-cli-esm plugins add myplugin

  Install a plugin from a github url.

    $ build-cli-esm plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ build-cli-esm plugins add someuser/someplugin
```

## `build-cli-esm plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ build-cli-esm plugins inspect PLUGIN...

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
  $ build-cli-esm plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/inspect.ts)_

## `build-cli-esm plugins install PLUGIN`

Installs a plugin into build-cli-esm.

```
USAGE
  $ build-cli-esm plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

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
  Installs a plugin into build-cli-esm.

  Uses bundled npm executable to install plugins into /home/tylerbu/.local/share/build-cli-esm

  Installation of a user-installed plugin will override a core plugin.

  Use the BUILD_CLI_ESM_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the BUILD_CLI_ESM_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ build-cli-esm plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ build-cli-esm plugins install myplugin

  Install a plugin from a github url.

    $ build-cli-esm plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ build-cli-esm plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/install.ts)_

## `build-cli-esm plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ build-cli-esm plugins link PATH [-h] [--install] [-v]

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
  $ build-cli-esm plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/link.ts)_

## `build-cli-esm plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ build-cli-esm plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ build-cli-esm plugins unlink
  $ build-cli-esm plugins remove

EXAMPLES
  $ build-cli-esm plugins remove myplugin
```

## `build-cli-esm plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ build-cli-esm plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/reset.ts)_

## `build-cli-esm plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ build-cli-esm plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ build-cli-esm plugins unlink
  $ build-cli-esm plugins remove

EXAMPLES
  $ build-cli-esm plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/uninstall.ts)_

## `build-cli-esm plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ build-cli-esm plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ build-cli-esm plugins unlink
  $ build-cli-esm plugins remove

EXAMPLES
  $ build-cli-esm plugins unlink myplugin
```

## `build-cli-esm plugins update`

Update installed plugins.

```
USAGE
  $ build-cli-esm plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.5/src/commands/plugins/update.ts)_
<!-- commandsstop -->
