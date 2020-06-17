# @fluid-example/diceroller

**Dice Roller** is a basic example that has a die and a button. Clicking the button re-rolls the die and 
persists the value in the root SharedDirectory. The Fluid Container is defined index.ts, the component is
defined in main.tsx.

## Getting Started

If you want to run this container follow the following steps:

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

Dice Roller uses the following distributed data structures:

- SharedDirectory - root
