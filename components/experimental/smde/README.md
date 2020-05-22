# SimpleMDE Markdown Editor (SMDE)

An experimental implementation of how to take the open source [SimpleMDE](https://simplemde.com/) markdown editor and
enable real-time coauthoring using the Fluid Framework.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Data model

SimpleMDE uses the following distributed data structures:

- SharedMap - root
- SharedString - storing SimpleMDE text
