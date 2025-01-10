`flub autocomplete`
===================

Display autocomplete installation instructions.

* [`flub autocomplete [SHELL]`](#flub-autocomplete-shell)

## `flub autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ flub autocomplete [SHELL] [-r]

ARGUMENTS
  SHELL  (zsh|bash|powershell) Shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  Display autocomplete installation instructions.

EXAMPLES
  $ flub autocomplete

  $ flub autocomplete bash

  $ flub autocomplete zsh

  $ flub autocomplete powershell

  $ flub autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v3.2.7/src/commands/autocomplete/index.ts)_
