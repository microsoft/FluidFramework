The core routerlicious API

The API contains endpoints for both the client and server side of routerlicious.


Stuff I should do...
* Sending of delta operations up to the server via the socket.io connection
* Routerlicious server the ability to log the operation, generate a sequence number, and then store the sequence
  number in the document. Need some backing storage for tracking the version number and ability to commit it.
* Have the clients pull from the event hub and be able to run the operations and serialize the snapshot

General questions
* Can I somehow reuse the old sharedb types here? Maybe they all listen for server updates but we pipe changes
  through my own place.
* Do I really need to abstract the shared data types inside of a container object like a document? Or can I expose    them as individual objects? The document may provide better visibility in to where the person is inside the document.
  But do we really want the MUI semantics of these objects being separably addressable?

* Do we need some form of discovery on the underlying data type? Probably not since this is placed within the JS from
  the MUI itself



Shared object
* Base class for all object types
* Construction puts it in a default, un-initialized state
* Caller must then either load it - which brings it in from an existing collab object. Or initializeLocal which
* makes it a local object that is not shared. A local object can be later attached which will make it
* shared.