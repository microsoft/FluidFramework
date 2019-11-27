# Paparazzi

![Statue of a paparazzo by sculptor Radko Macuha in Bratislava, Slovakia](https://upload.wikimedia.org/wikipedia/commons/1/18/Bratislava_Bronze_Paparazzo.jpg)

The logical storage model for documents is an ordered sequence of operations. Rather than requiring clients to replay
all operations when loading a document we instead periodically create consolidated logs of the operations. These
consolidated logs, or snapshots, are designed for quick and efficient loading of the document at a particular
sequence number.

Paparazzi was initially charged with just creating snapshots of documents. But it has since evolved to run
intelligent agents. Paparazzi agents are designed to be isomorphic - that is they can be run on both the server
and the client. This enables a connected client join in with a pool of server Paparazzi instances to perform
snapshotting and intelligence on a document.

Paparazzi instances connect to Foreman to receive instructions on what operations to perform on the document.