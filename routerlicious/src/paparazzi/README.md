# Paparazzi

The Paparazzi service takes snapshots of documents and then serializes them to storage. It does so by behaving like
a read-only client of a given document.

The Paparazzi service listens to a message queue to learn about new documents to snapshot. It is up to the service
to decide how many documents to snapshot at a given time and then when to no longer own snapshotting them. When it
decides to snapshot the service Paparazzi will connect to the routerlicious service to listen for document updates
and then apply them as they come in. The policies of the Paparazzi service determine when to snapshot the document.

## Viewing Snapshots

Git is used to store document snapshots and provide revision history. The git storage model maps well to our own
stream of delta messages. And git semantics as applied to document collaboration provide interesting areas for further
exploration (i.e. branching, forking, merging documents).

The paparazzi service currently maintains cloned git repos for the documents it processes. You can easily view these
by opening a shell into one of the running services. To do so start by getting the ID of the paparazzi container by
running

`docker ps`

And then get a shell into that container

`docker exec -it <paparazzi container id> /bin/sh`

Finally cd to the directory of repos

`cd /var/lib/prague/`

From there the folders map to document IDs and are the git repos for that document.