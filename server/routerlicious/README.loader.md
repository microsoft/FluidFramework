# Fluid Loader 

Experiment to build a minimum loader that can dynamically load Fluid code

Capabilities
* Connect to Fluid services
* Load snapshot data
* Read and write ops
* Client consensus protocol
* Versioning of loader

## Building

In order to be very clear about package differences this project makes use of [Lerna](https://lernajs.io)
to manage a monorepo.

To get started with lerna simply `npm install`. This will install lerna itself. From there you have access to
the tool by running `npx lerna`.

Lerna manages a set of npm modules that reside within the packages folder. It will automatically create
symlinks between dependent projects within the node_modules folder duration bootstrapping (its equivalent of npm
install). This allows for changes to be made to a dependent package without the need for reinstalling it in the
parent package.

Lerna then wraps npm commands and invokes them across all tracked projects. Most npm commands map directly - i.e.

|npm|lerna|
|---|-----|
|npm install|lerna bootstrap|
|npm run build|lerna run build|

Optional parameters can be passed to restrict these operations to a single project.

## Running private npm repository

`docker run -it --rm --name verdaccio -v $(pwd)/verdaccio/conf:/verdaccio/conf -p 4873:4873 verdaccio/verdaccio:3`

The default username/password to access the registry is prague/8Fxttu_A
