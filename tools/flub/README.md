# @fluid-internal/flub

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

flub is not built in CI. You need to build it locally.

<!-- toc -->
* [@fluid-internal/flub](#fluid-internalflub)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage
<!-- usage -->
```sh-session
$ npm install -g flub
$ flub COMMAND
running command...
$ flub (--version)
flub/0.0.0 linux-x64 node-v14.19.3
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`flub bump [FILE]`](#flub-bump-file)
* [`flub help [COMMAND]`](#flub-help-command)
* [`flub plugins`](#flub-plugins)
* [`flub plugins:install PLUGIN...`](#flub-pluginsinstall-plugin)
* [`flub plugins:inspect PLUGIN...`](#flub-pluginsinspect-plugin)
* [`flub plugins:install PLUGIN...`](#flub-pluginsinstall-plugin-1)
* [`flub plugins:link PLUGIN`](#flub-pluginslink-plugin)
* [`flub plugins:uninstall PLUGIN...`](#flub-pluginsuninstall-plugin)
* [`flub plugins:uninstall PLUGIN...`](#flub-pluginsuninstall-plugin-1)
* [`flub plugins:uninstall PLUGIN...`](#flub-pluginsuninstall-plugin-2)
* [`flub plugins update`](#flub-plugins-update)

## `flub bump [FILE]`

describe the command here

```
USAGE
  $ flub bump [FILE] [-n <value>] [-f]

FLAGS
  -f, --force
  -n, --name=<value>  name to print

DESCRIPTION
  describe the command here

EXAMPLES
  $ flub bump
```

_See code: [dist/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/v0.0.0/dist/commands/bump.ts)_

## `flub help [COMMAND]`

Display help for flub.

```
USAGE
  $ flub help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for flub.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.12/src/commands/help.ts)_

## `flub plugins`

List installed plugins.

```
USAGE
  $ flub plugins [--core]

FLAGS
  --core  Show core plugins.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ flub plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.1.0/src/commands/plugins/index.ts)_

## `flub plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ flub plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.

  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ flub plugins add

EXAMPLES
  $ flub plugins:install myplugin

  $ flub plugins:install https://github.com/someuser/someplugin

  $ flub plugins:install someuser/someplugin
```

## `flub plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ flub plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ flub plugins:inspect myplugin
```

## `flub plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ flub plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.

  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ flub plugins add

EXAMPLES
  $ flub plugins:install myplugin

  $ flub plugins:install https://github.com/someuser/someplugin

  $ flub plugins:install someuser/someplugin
```

## `flub plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ flub plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.

EXAMPLES
  $ flub plugins:link myplugin
```

## `flub plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ flub plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub plugins unlink
  $ flub plugins remove
```

## `flub plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ flub plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub plugins unlink
  $ flub plugins remove
```

## `flub plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ flub plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ flub plugins unlink
  $ flub plugins remove
```

## `flub plugins update`

Update installed plugins.

```
USAGE
  $ flub plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
