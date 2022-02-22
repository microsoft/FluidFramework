# Fluid Reference Server Implementation

This directory contains our reference server implementation. [Routerlicious](./routerlicious) is the main composed server definition that pulls together multiple micro-services that provide the ordering and storage requirement of Fluid runtime.

## Directories

[Admin](./admin) provides tenant management for Routerlicious

[Charts](./charts) Kubernetes charts for some micro-services

[Gateway](./gateway) Internal landing page for the Fluid server

[Gitrest](./gitrest) provides a REST API to a GitHub repository. Its API is based off of GitHub's REST APIs.

[Gitssh](./gitssh) is a git ssh server client container.

[Historian](./historian) provides a REST API to git repositories. The API is similar to that exposed by GitHub but can be used in local development.

[Lambdas](./routerlicious/packages/lambdas) reusable lambdas for serverless implementation, Routerlicious, and Tinylicious.

[Routerlicious](./routerlicious) composed reference server implementation

[Tinylicious](./tinylicious) Light-weight monolithic server implementation


## Running the Reference Server
To get started with Routerlicious and the Fluid reference implementation, you must install docker and allocate at least 4gb of RAM. We suggest you use our docker images, as outlined by the [docker compose](./docker-compose.yml) to start. You can run ```npm run start:docker``` from the root directory to try this.

1. Download and install [Docker](https://docs.docker.com/desktop/)
2. Configure Docker to have 4gb of RAM
3. Start the docker container with `npm run start:docker` from the repo root, which does this:
  ```
  "start:docker": "docker-compose -f server/docker-compose.yml up"
  ```

### Developing the Reference Server

For development, you'll also need to give docker access to your drive (Shared Drives). The instructions for local development are available in [Routerlicious](./routerlicious).

To locally test changes across [GitRest](./gitrest), [Historian](./historian), and [Routerlicious](./routerlicious), run `docker compose -f docker-compose.dev.yml up` from `server/` instead of `server/routerlicious`. Then, when making a change, rebuild the relevant service and restart it. For example,

```shell
cd server/gitrest
npm run build
cd ..
docker compose restart gitrest
```

### Common Issues
* Port already allocated
  * This can happen if you have a process already running on a port the docker-compose file expects to have available
* Drive Share Failure
  * An intermittent failure most frequent on Windows, best solved by reinstalling
* Not Enough RAM
  * Allocate more RAM

### Using older version of published docker images
By default the [docker compose](./docker-compose.yml) file pulls the latest published images. If you want to use a specific version for testing, you can make a copy of `docker-compose.yml` and change the tag from `latest` to a specific version number.

## Routerlicious for Local Development
### With Webpack Dev Server && the Webpack Fluid Loader (Yo-Fluid Output)

To use Routerlicious with a Yo-Fluid container, you should start the Routerlicious docker containers, and then start the webpack dev server with the docker env command.
```
    "start:docker": "webpack-dev-server --config webpack.config.js --package package.json --env.mode docker",
```

### Using the Gateway Host

Gateway is an example of a service providing its own Fluid Container host. [Gateway](./gateway) serves a Fluid Loader.

You can access this loader by using the following URL Schema
```
https://localhost:3000/loader/fluid/${container-identifier}?chaincode=${data-store-package-name}@${version}
```
