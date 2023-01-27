# @fluid-example/bubblebench-sharedtree

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/bubblebench-sharedtree`
1. Run `npm start` from this directory (experimental/examples/bubblebench/sharedtree) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Benchmarking

Remember to produce a production bundle when taking measurements:

```bash
npm run start -- --env.production
```

## Testing

```bash
npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
launch: {
  dumpio: true, // output browser console to cmd line
  slowMo: 500,
  headless: false,
},
```
