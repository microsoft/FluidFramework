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

`curl -H "Content-Type: application/json" -X POST -d '{"name": "test.git"}' --verbose localhost:3000/repos`