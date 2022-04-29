# Policy Check

This tool enforces polices across the code base via a series of handlers.

## Assert Short Code
    Replaces assert messages with hexadecimal numbers, or shortcodes. These reduce the bundle size and memory foot print of our code base. You should continue to provide string based assert messages, these will be replaced with shortcodes before release, and the message will be move to a comment.

## Copyright Headers
    Ensures all files have the appropriate copyright header.

## Fluid Casing
    Ensures all references to Fluid are written with an upper case 'F'.

## Npm Package
    Ensure all package dependencies in npm package files are sorted.
