---
"@fluid-internal/client-utils": minor
---

Internal buffer encoding helpers now require 'utf8', 'utf-8', or 'base64'

Previously, the buffer encoding helpers 'Uint8ArrayToString', 'bufferToString', and 'IsoBuffer.toString' would accept a string argument, which was overly permissive.

The type of the 'encoding' argument has been narrow to just the supported values 'utf8', 'utf-8', or 'base64'.
