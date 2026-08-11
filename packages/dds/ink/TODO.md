# Next steps for Ink/Canvases

Ink is an in-progress data structure with the purpose of facilitating collaborative inking. There is a set of anticipated work to be done still, including breaking changes across Ink and the Canvas example. Please do try it out and let us know what you think, but also be prepared for the following incoming changes:

## Coordinate bundling

-   Enable bundled coordinate updates rather than one per op

## Canvas consolidation

-   Consider splitting the new InkCanvas control into input/output, to enable reuse of input handling across multiple renderers.

## Wet ink and ink drying

-   Distinguish wet/dry ink in the data model
-   Add an op for drying a stroke
-   Enable wet/dry ink

## Atomic stroke rendering

-   Enable atomic stroke rendering on the canvases, allowing transparency in ink color (requires wet ink for rendering performance)
