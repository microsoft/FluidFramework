# Monaco

An experimental implementation of how to take the Microsoft's open source [Monaco](https://github.com/Microsoft/monaco-editor) code editor
and enable real-time coauthoring using the Fluid Framework.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Data model

Monaco uses the following distributed data structures:

- SharedDirectory - root
- SharedString - storing Monaco text
