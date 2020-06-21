# @fluidframework/clicker-context

**clicker-context** shows how we can pass use React.Context in combination with our createFluidContext hook to completely abstract away any Fluid dependency from the view itself, while still having our view state be powered using custom defined DDS schemas. To show how this can be applied in real-world applications with multiple component/container layers, this example is broken up into four parts:

1) **component.tsx** - This contains the Fluid component itself and will normally be the code will run as part of a production application's data store initializing procedure. From here it can pass the syncedComponent reference to the container.

2) **container.tsx** - This contains the priming code for the context. It now calls our createFluidContext to prepare our synced state and synced setState values. These are then passed into the context provider for our PrimedContext.

3) **context.tsx** - This stores the PrimedContext constant so that it can be referenced throughout the app

4) **view.tsx** - This contains the view, by itself, with no reference to Fluid, but rather only to our PrimedContext.

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
