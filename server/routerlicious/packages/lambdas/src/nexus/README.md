# Nexus

Nexus verifies and maintains websocket sessions to clients. It provides an orderer for writer clients and keeps a list of readonly clients connected to the session.

Clients connect to it after retrieving the discovery result from Alfred. The deltaStreamUrl returned there points them to Nexus.
