`flub autocomplete`
===================

display autocomplete installation instructions

* [`flub autocomplete [SHELL]`](#flub-autocomplete-shell)

## `flub autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ flub autocomplete [SHELL] [-r]

ARGUMENTS
  SHELL  (zsh|bash|powershell) Shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  display autocomplete installation instructions

EXAMPLES
  $ flub autocomplete

  $ flub autocomplete bash

  $ flub autocomplete zsh

  $ flub autocomplete powershell

  $ flub autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v2.3.0/src/commands/autocomplete/index.ts)_
