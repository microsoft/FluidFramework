# @fluidframework/gitrest-base

The `@fluidframework/gitrest-base` package exports base GitRest constructs consumable by service providers.

Creating or updating a Git reference requires a `sha` value with exactly 40 lowercase hexadecimal characters.
Noncanonical values are rejected with HTTP 400 by both the routes and the repository manager.
