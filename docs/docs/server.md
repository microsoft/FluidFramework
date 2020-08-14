# The Fluid server

While Fluid Framework is very client-centric, it does rely on a server component. A reference implementation of a Fluid
server called _Routerlicious_ is included in the FluidFramework repo. Note that Routerlicious is one of many Fluid
servers that could be implemented.

Fluid servers like Routerlicious have three responsibilities:

1. They assign monotonically increasing sequence numbers to incoming operations.
1. They then broadcast the operations to all connected clients, including their sequence numbers.
1. They're also responsible for storing Fluid data in the form of summary operations.


## Ordering



## Summaries

## Storage

### Ordering and drivers

### Creating new drivers

## Op routing
