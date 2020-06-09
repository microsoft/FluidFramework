# @fluidframework/view-adapters

Component views may be written using a variety of UI frameworks.  The view adapters module provides helpful tools for composing these view components, intended for use when either:
1. The component being composed is from a different framework than its visual host.
2. It is not known which framework was used in the component being composed.

The adapters translate between different view frameworks to satisfy #1, and are able to inspect a view component to deduce its framework to satisfy #2.
