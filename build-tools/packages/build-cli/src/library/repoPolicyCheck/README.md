# Policy Check

This tool enforces polices across the code base via a series of handlers.

## Assert Short Code

Replaces assert messages with hexadecimal numbers, or shortcodes. These reduce the bundle size and memory foot print of
our code base. You should continue to provide string based assert messages, which will be replaced with shortcodes before
release, and the message will be moved to a comment. Use literal strings; interpolated strings will
be rejected since interpolation won't happen once they're moved to a comment. This handler also creates/updates a `.ts`
file that exports the mapping of (formatted) short codes to the original error messages, which can be leveraged through
the `validateAssertionError` function exposed in `test-runtime-utils`. This enables scenarios like tests checking for
specific assertions failing and working whether they see the original message or the formatted short code.

## Copyright Headers

Ensures all files have the appropriate copyright header.

## Fluid Casing

Ensures all references to Fluid are written with an upper case 'F'.

## Npm Package

Ensure all package dependencies in npm package files are sorted.
