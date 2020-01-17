## Faux Driver

This is an implementation of a driver which does not actually connects to backend. It lies to runtime that it has connected and store ops in memory. It provides some services of server like stamping ops and sending them back to
the client.