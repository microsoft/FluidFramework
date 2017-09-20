# GIT REST

Provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

## Building and running

Because nodegit is built as a native module it's simplest to build and run historian from within a Docker container.

We reuse our production container for this purpose. In development mode this does a double build (once in the
container build and a second time when mounting your source directory). Future work may want to create a development
specific container.

You can build the container by running.

`docker build -t gitrest .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -p 3000:3000 gitrest /bin/sh`

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
```
curl -H "Content-Type: application/json" -X POST -d '{"name": "test"}' --verbose localhost:3000/repos
curl -H "Content-Type: application/json" -X POST -d '{"content": "Hello, World!", "encoding": "utf-8"}' --verbose localhost:3000/repos/test/git/blobs
curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"}]}' --verbose localhost:3000/repos/test/git/trees
curl --verbose localhost:3000/repos/test/git/trees/bf4db183cbd07f48546a5dde098b4510745d79a1
curl -H "Content-Type: application/json" -X POST -d '{"message": "first commit", "tree": "bf4db183cbd07f48546a5dde098b4510745d79a1", "parents": [], "author": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/test/git/commits
curl --verbose localhost:3000/repos/test/git/commits/cf0b592907d683143b28edd64d274ca70f68998e
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/master", "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose localhost:3000/repos/test/git/refs
curl --verbose http://localhost:3000/repos/test/git/refs
curl -X DELETE --verbose http://localhost:3000/repos/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X POST -d '{"ref": "refs/heads/master", "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose localhost:3000/repos/test/git/refs
# first fails - second works
curl -H "Content-Type: application/json" -X PATCH -d '{"force": false, "sha": "cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose http://localhost:3000/repos/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X PATCH -d '{"force": true, "sha": 
"cf0b592907d683143b28edd64d274ca70f68998e"}' --verbose http://localhost:3000/repos/test/git/refs/heads/master
curl -H "Content-Type: application/json" -X POST -d '{"tag": "v1.0", "message": "Hello, World!", "object": "cf0b592907d683143b28edd64d274ca70f68998e", "type": "commit", "tagger": { "name": "Kurt Berglund", "email": "kurtb@microsoft.com", "date": "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)" }}' --verbose localhost:3000/repos/test/git/tags
curl --verbose localhost:3000/repos/test/git/tags/a8588b3913aa692c3642697d6f136cec470dd82c
```