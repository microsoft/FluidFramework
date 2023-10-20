# Nexus

Nexus is a microservice that handles the Socket.IO that used to belong to Alfred. This means Nexus now handles the operation stream (websocket connections) part of routerlicious while Alfred keeps serving the HTTP document APIs.

In order for the Nexus routing to work correctly, the client must have the Discovery feature enabled. Alfred will then return the deltaStreamURL pointing to a Nexus URL.

Reasons for this split are primarily, ease of scaling and measuring performance of the independent microservices.
