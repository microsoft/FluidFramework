# @fluid-experimental/partial-checkout
Creates a simple colored squares board. After installing and starting (directions below) you can create start creating and moving squares going to localhost:8080. Your path variable is the unique identifier for that collaborative session.

## Getting Started

After cloning the repository, install dependencies with:

Go back to the root folder and run:
```bash
npm install
alias fb='clear && node "$(git rev-parse --show-toplevel)/node_modules/.bin/fluid-build"'
fb --install --symlink:full
fb --all @fluid-experimental/partial-checkout  @fluid-experimental/property-query tinylicious
```

Then, go to property-query package and start the server to run MH:
```bash
cd experimental/PropertyDDS/services/property-query
npm start
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

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
