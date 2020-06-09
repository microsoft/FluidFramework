# @fluid-example/codemirror

An experimental implementation of how to take the open source [CodeMirror](https://codemirror.net/) code editor
and enable real-time coauthoring using the Fluid Framework.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Data model

CodeMirror uses the following distributed data structures:

- SharedDirectory - root
- SharedString - storing codemirror text

## Known issues

[#1157 - Presence in CodeMirror is not always correct](https://github.com/microsoft/FluidFramework/issues/1157)
