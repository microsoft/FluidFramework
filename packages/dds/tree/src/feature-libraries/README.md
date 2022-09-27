# Feature Libraries

Concrete implementations of abstractions used to parameterize `SharedTreeCore`, or any other entry points to the `tree` package.
`SharedTreeCore` should be usable with alternative versions of anything withing this library.

This directory will end up containing a wide variety of implementations, including:

- Definitions of fields kinds for schema
- Schema languages (which support some of these field kinds)
- Families of changes/edits which can be applies for various field kinds
- `ChangeRebaser` implementations for these change families
- Implementations of Forest
