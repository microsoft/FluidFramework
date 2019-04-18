This folder contains examples of embedding node.js as a shared library within an application.

A win32 project is contained within the nodelib folder. To build open nodelib\nodelib.sln and
build the project. Currently only 64 bit versions are supported.

Note that the node libraries are not included within the repository and must be downloaded.
Instructions for doing that are contained within the [nodelib/lib](nodelib/lib) folder.

After building the project simply run nodelib.exe <path to entry point JS file>. This will
startup the app and run the provided script. A good embedded example is contained at
[routerlicious/src/tools/example.ts](../../routerlicious/src/tools/example.ts). Follow
the routerlicious instructions to build the sample.

