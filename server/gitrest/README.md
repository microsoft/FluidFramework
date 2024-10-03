# gitrest

Provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

## Building and running

We reuse our production container for this purpose. In development mode this does a double build (once in the
container build and a second time when mounting your source directory). Future work may want to create a development
specific container.

You can build the container by running.

`docker build -t gitrest .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -p 3000:3000 gitrest /bin/bash`

If you want to debug and test

`docker run -p 3000:3000 -p 9229:9229 --rm -t gitrest node --inspect=0.0.0.0:9229 dist/www.js`

Alternatively, for development, use docker-compose to start a mounted container

```shell
npm run start:dev
```

Then, when making changes, to update the running container code

```shell
npm run build
docker-compose restart gitrest
```

### Build and run alongside local R11s

1. Comment out all services in `gitrest/docker-compose.yml` except for gitrest,
   then save.
1. Comment out the gitrest service within `routerlicious/docker-compose.yml`,
   then save.
1. Start Routerlicious by following instructions within
   `server/routerlicious/README.md`.
1. Run `npm run start:dev` from gitrest.
1. Troubleshooting: if you see gitrest errors like `Repo does not exist /home/node/documents/fluid/fluid`, run `docker-compose restart` from within `server/routerlicious`.

## Testing

`docker run -t gitrest npm test`

## Example REST API usage

Create the repo

```
curl -H "Content-Type: application/json" -X POST -d '{"name": "test"}' --verbose localhost:3000/prague/repos
```

Create a first commit and update main ref

```
curl -H "Content-Type: application/json" -X POST -d '{"content": "Hello, World!", "encoding": "utf-8"}' --verbose localhost:3000/repos/prague/test/git/blobs
curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"}]}' --verbose localhost:3000/repos/prague/test/git/trees
curl --verbose localhost:3000/repos/prague/test/git/trees/bf4db183cbd07f48546a5dde098b4510745d79a1
curl -H "Content-Type: application/json" -X POST -d '{"message": "first commit", "tree": "bf4db183cbd07f48546a5dde098b4510745d79a1", "parents": [], "author": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/commits
curl --verbose localhost:3000/repos/prague/test/git/commits/38421e18f9cf4ec024ae98f687e79c0bdf8f3f18
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/main", "sha": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18"}' --verbose localhost:3000/repos/prague/test/git/refs
curl --verbose http://localhost:3000/repos/prague/test/git/refs
```

Submodule example

```
curl -H "Content-Type: application/json" -X POST -d '{"content": "[submodule \"module\"]\n\tpath = module\n\turl = ssh://git@localhost:3022/home/git/prague/test", "encoding": "utf-8"}' --verbose localhost:3000/repos/prague/test/git/blobs
curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": ".gitmodules", "mode": "100644", "type": "blob", "sha": "54a2d1738d0c62529ada54d32c5d05e1d1ea0fae"},{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"},{"path": "module", "mode": "160000", "type": "commit", "sha": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18"}]}' --verbose localhost:3000/repos/prague/test/git/trees
curl -H "Content-Type: application/json" -X POST -d '{"message": "submodule commit", "tree": "f007d4f4ebe654785e87634a2e8f91d02993361d", "parents": [], "author": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/commits
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/modules", "sha": "b02301e7f2a6e1cc0bdb8cb33f4905f7c7b17ecc"}' --verbose localhost:3000/repos/prague/test/git/refs
```

Reference deletion and tags

```
curl -X DELETE --verbose http://localhost:3000/repos/prague/test/git/refs/heads/main
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/main", "sha": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18"}' --verbose localhost:3000/repos/prague/test/git/refs
# first fails - second works
curl -H "Content-Type: application/json" -X PATCH -d '{"force": false, "sha": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18"}' --verbose http://localhost:3000/repos/prague/test/git/refs/heads/main
curl -H "Content-Type: application/json" -X PATCH -d '{"force": true, "sha": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18"}' --verbose http://localhost:3000/repos/prague/test/git/refs/heads/main
curl -H "Content-Type: application/json" -X POST -d '{"tag": "v1.0", "message": "Hello, World!", "object": "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18", "type": "commit", "tagger": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/tags
curl --verbose localhost:3000/repos/prague/test/git/tags/2f208d6d4c5698feada2b5dad3886a0ceff4f80b
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
