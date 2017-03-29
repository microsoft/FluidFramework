The routerlicious server

The server makes use of the routerlicious API to serve routerlicious clients. Socket.io is used to listen to
inbound connections from clients. Inbound messages are marked with a sequence number and then forwarded to an
Azure Event Hub for processing.