# Paparazzi

The Paparazzi service takes snapshots of documents and then serializes them to storage. It does so by behaving like
a read-only client of a given document.

The Paparazzi service listens to a message queue to learn about new documents to snapshot. It is up to the service
to decide how many documents to snapshot at a given time and then when to no longer own snapshotting them. When it
decides to snapshot the service Paparazzi will connect to the routerlicious service to listen for document updates
and then apply them as they come in. The policies of the Paparazzi service determine when to snapshot the document.