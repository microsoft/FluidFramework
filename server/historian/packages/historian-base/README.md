# @fluidframework/historian-base

The historian base package exports base historian constructs consumable by service providers.

Creating or updating a Git reference requires a `sha` value with exactly 40 lowercase hexadecimal characters.
Historian rejects noncanonical values with HTTP 400 before forwarding the request to GitRest.
