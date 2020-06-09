# gitrest

[![GitRest Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/8/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=8)

Provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

## Building and running

Because nodegit is built as a native module it's simplest to build and run historian from within a Docker container.

To begin you'll need to connect to the Fluid private npm repository. Instructions can be found [here](../routerlicious/README.md#authorizing-to-private-npm-feed)

We reuse our production container for this purpose. In development mode this does a double build (once in the
container build and a second time when mounting your source directory). Future work may want to create a development
specific container.

You can build the container by running.

`docker build --build-arg NPM_TOKEN=${NPM_TOKEN} -t gitrest .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -p 3000:3000 -e NPM_TOKEN=${NPM_TOKEN} gitrest /bin/bash`

If you want to debug and test

`docker run -p 3000:3000 -p 9229:9229 --rm -t gitrest node --inspect=0.0.0.0:9229 dist/www.js`

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

Create a first commit and update master ref
```
curl -H "Content-Type: application/json" -X POST -d '{"content": "Hello, World!", "encoding": "utf-8"}' --verbose localhost:3000/repos/prague/test/git/blobs
curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"}]}' --verbose localhost:3000/repos/prague/test/git/trees
curl --verbose localhost:3000/repos/prague/test/git/trees/bf4db183cbd07f48546a5dde098b4510745d79a1
curl -H "Content-Type: application/json" -X POST -d '{"message": "first commit", "tree": "bf4db183cbd07f48546a5dde098b4510745d79a1", "parents": [], "author": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/commits
curl --verbose localhost:3000/repos/prague/test/git/commits/cf0b592907d683143b28edd64d274ca70f68998e
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/master", "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose localhost:3000/repos/prague/test/git/refs
curl --verbose http://localhost:3000/repos/prague/test/git/refs
```

Submodule example
```
curl -H "Content-Type: application/json" -X POST -d '{"content": "[submodule \"module\"]\n\tpath = module\n\turl = ssh://git@localhost:3022/home/git/prague/test", "encoding": "utf-8"}' --verbose localhost:3000/repos/prague/test/git/blobs
curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": ".gitmodules", "mode": "100644", "type": "blob", "sha": "54a2d1738d0c62529ada54d32c5d05e1d1ea0fae"},{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"},{"path": "module", "mode": "160000", "type": "commit", "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}]}' --verbose localhost:3000/repos/prague/test/git/trees
curl -H "Content-Type: application/json" -X POST -d '{"message": "submodule commit", "tree": "f007d4f4ebe654785e87634a2e8f91d02993361d", "parents": [], "author": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/commits
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/modules", "sha": "b02301e7f2a6e1cc0bdb8cb33f4905f7c7b17ecc"}' --verbose localhost:3000/repos/prague/test/git/refs
```

Reference deletion and tags
```
curl -X DELETE --verbose http://localhost:3000/repos/prague/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/master", "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose localhost:3000/repos/prague/test/git/refs
# first fails - second works
curl -H "Content-Type: application/json" -X PATCH -d '{"force": false, "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose http://localhost:3000/repos/prague/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X PATCH -d '{"force": true, "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose http://localhost:3000/repos/prague/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X POST -d '{"tag": "v1.0", "message": "Hello, World!", "object": "cf0b592907d683143b28edd64d274ca70f68998e", "type": "commit", "tagger": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/prague/test/git/tags
curl --verbose localhost:3000/repos/prague/test/git/tags/a8588b3913aa692c3642697d6f136cec470dd82c
```
