# Clicker with Hooks

**Clicker** is a Fluid Component that displays a number with a button. Pressing the button
increments the counter. This is a basic example component using the interface model and stock
classes.

**Clicker** there are 3 different implementations here using the useFluidState, useFluidReducer, and createFluidContext hooks

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

## Data model

Badge uses the following distributed data structures:

- SharedDirectory - root
