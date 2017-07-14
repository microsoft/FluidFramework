# Historian

The historian service tracks the historical record for a document.

It serves as a proxy to the underlying git repository that maintains the versioned snapshots.

To get proper builds on mac you may need to run

`xcode-select --install`

Because nodegit is built as a native module it's simplest to build and run historian from within a Docker container.
We reuse our production container for this purpose. In development mode this does a double build (once in the
container build and a second time when mounting your source directory). Future work might want to create a dev vs.
run container.

You can build the container by running.

`docker build -t historian .`

And then mount it for development by running.

`docker run -it -v $(pwd):/home/node/server historian /bin/sh`

## Testing

`curl -H "Content-Type: application/json" -X POST -d '{"name": "test"}' --verbose localhost:3000/repos`
`curl -H "Content-Type: application/json" -X POST -d '{"content": "Hello, World!", "encoding": "utf-8"}' --verbose localhost:3000/repos/test/git/blobs`
`curl -H "Content-Type: application/json" -X POST -d '{"tree": [{"path": "file.txt", "mode": "100644", "type": "blob", "sha": "b45ef6fec89518d314f546fd6c3025367b721684"}]}' --verbose localhost:3000/repos/test/git/trees`
`curl --verbose localhost:3000/repos/test/git/trees/bf4db183cbd07f48546a5dde098b4510745d79a1`
