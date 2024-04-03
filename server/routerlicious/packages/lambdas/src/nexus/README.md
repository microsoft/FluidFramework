# Nexus

Nexus verifies and maintains websocket sessions to clients. It provides an orderer for writer clients and keeps a list of readonly clients connected to the session.

Clients connect to it after retrieving the discovery result from Alfred. The deltaStreamUrl returned there points them to Nexus.

## Graceful shutdown

To avoid a spike from reconnecting clients when downing Nexus, you can opt to disconnect them in batches using the following configuration under nexus.socketIo configuration:

```
	"nexus": {
                "socketIo": {
                       "gracefulShutdownEnabled": true,
                       "gracefulShutdownDrainTimeMs": 30000,
                       "gracefulShutdownDrainIntervalMs": 1000
[...]
```

From this example configuration, whenever Nexus receives a SIGTERM (signal 15) it will disconnect its socket connections over 30seconds, disconnecting a batch every 1s. Check also the configuration for total shutdown timeout for Nexus to make sure it is more than the drain time.
