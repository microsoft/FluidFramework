# gitrest


Provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

## Building and running

Because nodegit is built as a native module it's simplest to build and run historian from within a Docker container.

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

## Nodegit Workarounds

We hit a nodegit bug around tree_entry so are using a private version until it can get merged in. The private version is
hosted via a gzipped tar file stored on Azure.

This led to a couple issues itself. One is with node-pre-gyp and the package-lock.json https://github.com/mapbox/node-pre-gyp/issues/298

To workaround this we are temporarily disabling the package-lock.json file.

Should the above get fixed and we can go back to package-lock there would still be an issue running npm update with
the gzipped reference https://github.com/npm/npm/issues/17835

Should you need to update you'll want to remove the nodegit reference first, perform the update, then install it
back in.

There is a PR out to nodegit. Once they merge it in and publish a new version we can avoid both issues.

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

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
