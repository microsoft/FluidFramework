# @fluidframework/experimental-creation-driver

This is experimental prototype.
This is an implementation of a driver which does not actually connects to backend. It lies to runtime that it has connected and stores ops in memory. It provides some services of server like stamping ops and sending them back to
the client. This will be used in new file creation scenario. As this driver does not initiate any connections to server, so the connection to 3 endpoints would be faster and the client will be able to have control over document
faster. When the actual connections are made, this driver will disconnect and dump the ops to the server.