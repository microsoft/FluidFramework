# Prague

## Running against our API

### Private NPM Repository

The simplest way to get up and running with Prague is to install our npm module and then run against our production service. From there you can choose whether to webpack, browserify, etc...

To get started simply
* Navigate to our production npm repository https://offnet.visualstudio.com/officenet/_packaging?feed=prague&_a=feed. 
* Click the "Connect to feed" link
* Choose "npm"
* And then follow the steps provided. This involves adding a new line to your project's .npmrc as well as storing credentials to access the private repo on your machine.

The [threejs](./api/examples/threejs) example is setup using the above approach.

#### Projects

##### @prague/routerlicious
The core Prague project. This contains the client side code you need to run Prague.

You can choose to run against our production endpoints or run the service yourself locally. See the [Routerlicious README]('../routerlicious') for more information

If using WebPack you will need to update your config to exclude certain node modules. An example webpack config is given
below showing how to exclude fs from node. We are working to break these dependencies.

```
module.exports = {
    entry: './dist/index.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    node: {
        fs: 'empty'
    }
};
```

#### Private NPM and Docker

All of our services are built using Docker. Integrating a private npm repository with Docker adds a bit of [extra complexity](https://docs.npmjs.com/private-modules/docker-and-private-modules). In addition to the above steps there are also a few more you need to take if you want to build a Docker container that references a private repository.

* After generating your credentials copy everything after the feed URL - i.e. `//offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/:_authToken=<Token>`
* Define a NPM_TOKEN environment variable
    * On Mac/Linux add a line `export NPM_TOKEN=<Token>` to your .zshrc, .bashr, etc...
    * On Windows edit your PowerShell profile to define the token

In the root of your new project create a .npmrc file with the following contents

```
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/:_authToken=${NPM_TOKEN}
@prague:registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/
always-auth=true
```

Edit your Dockerfile to contain the following lines prior to the `npm install`

```
ARG NPM_TOKEN  
COPY .npmrc .npmrc  
```

When building you then need to provide the token as a build argument.

```
docker build --build-arg NPM_TOKEN=${NPM_TOKEN} .
```

### Script include

We also publish our API files which can be included in your project with a `<script>` tag. The [sequence](./api/examples/sequence) example shows how to do this. We recommend installing from npm rather than using this approach since it better integrates with a modern JavaScript development environment.
