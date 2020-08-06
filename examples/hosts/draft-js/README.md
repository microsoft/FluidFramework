# @fluid-example/draft-js

An experimental implementation of how to take Facebook's open source [Draft.js](https://draftjs.org/) rich text editor and
enable real-time coauthoring using the Fluid Framework.

## Getting Started

To run this follow the steps below:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start:server` to start a Tinylicious Fluid Server
4. Run `npm run start` (from a different command window) to start the Collaborative Draft.js example

## Data model

Draft.js uses the following distributed data structures:

- SharedDirectory - root
- SharedString - storing Draft.js text
- SharedMap - storing user presence

## Known Issues

Currently presence is persisted via entries into the SharedMap. While this ensures that presence is persisted into the history
it also leads to large amounts of operations which can bloat the size of the op stream and slow down future loads. An alternative
solution is to enable ephemeral presence by using Signals ops and character input tracking as location queues.
