# @fluidframework/server-lambdas

Core set of Fluid lambdas. Each lambda recieves a message from an input stream and outputs it to another stream. The input and output streams are always abstracted. Lambdas are always triggered by an incoming message. In addition to processing, lambdas are also responsible for checkpointing their state when messages are processed and forwarded, hence ensuring at least one processing guarantee.

Checkout each lambda folder for a brief documentaion.
