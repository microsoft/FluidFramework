# Prague Loader 

Experiment to build a minimum loader that can dynamically load Prague code

Capabilities
* Connect to Prague services
* Load snapshot data
* Read and write ops
* Client consensus protocol
* Versioning of loader

## Lerna

In order to be very clear about package differences this project makes use of [Lerna](https://lernajs.io)
to manage a monorepo.

To install globally and be able to call lerna directly run `npm install -g lerna` or alternately you can run `npx lerna` to have npm install the package and then execute the script.

Lerna wraps npm commands and manages symlinks between projects. Most npm commands map directly - i.e.

|npm|lerna|
|---|-----|
|npm install|lerna bootstrap|
|npm run build|lerna run build|

Optional parameters can be passed to restrict these operations to a single project.