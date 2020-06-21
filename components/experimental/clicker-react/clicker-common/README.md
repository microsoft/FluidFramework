# @fluid-example/clicker-common

**clicker-common** contains the maps and reducers that these views consumer.
**clicker-definitions** contains the interfaces the views, reducers, and maps the different Clicker implementations consume.
**clicker-common** has no dependencies on the views or components themselves, allowing them to be developed as a standalone package. The only thing linking the view and this together are the definitions.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

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
