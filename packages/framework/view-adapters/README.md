# @fluidframework/view-adapters

Views may be written using a variety of UI frameworks. The view adapters module provides helpful tools for composing these views, intended for use when either:

1. The view being composed is from a different framework than its visual host.
2. It is not known which framework was used in the view being composed.

The adapters translate between different view frameworks to satisfy #1, and are able to inspect a view to deduce its framework to satisfy #2.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
