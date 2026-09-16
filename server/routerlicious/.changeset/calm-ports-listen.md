---
"tinylicious": minor
"__section": feature
---
Tinylicious can now be started on a specific port using `--port <number>` or `--port=<number>`.

The port must be an integer between 0 and 65535.
When selecting a port, Tinylicious uses the command-line argument first, followed by the `PORT` environment variable, and then the default port of 7070.
