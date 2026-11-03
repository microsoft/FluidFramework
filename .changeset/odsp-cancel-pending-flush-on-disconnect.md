---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Cancel pending flush requests promptly when the connection disconnects

Pending flush requests now reject with the connection's disconnect error when the connection is disposed or disconnected.
This prevents summary uploads waiting on a flush response from remaining pending after disconnection.
