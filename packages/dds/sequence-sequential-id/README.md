# @fluidframework/sequence-sequential-id

SharedStringWithSequentialId is a DDS that automatically generates ids to inserted markers after they have been acknowledged by the server.

The ids assigned to the markers are "sequential ids". This means that the ids are unique and have an order based on where the marker was inserted. Having an order means that the value of the id is greater than the id of the marker before it (if there is one) and less than the id of the marker after it (if there is one).
