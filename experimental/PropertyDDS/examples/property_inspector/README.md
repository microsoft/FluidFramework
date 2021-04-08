# Property Inspector
An app for inspecting documents created by propertyDDS using an efficient table-tree.

## Getting Started

After cloning the repository, install dependencies with:

Go back to the root folder and run:
```bash
npm install
alias fb='clear && node "$(git rev-parse --show-toplevel)/node_modules/.bin/fluid-build"'
fb --install --symlink:full
fb --all @fluid-experimental/partial-checkout  @fluid-experimental/property-query tinylicious
```

You can then run the example with:

```bash
npm start
```

This will open a browser window to the example.  You can navigate to the same URL in a second window to see changes propagating between clients.

To webpack the bundle and output the result in `./dist`, you can run:

```bash
npm run build
```
