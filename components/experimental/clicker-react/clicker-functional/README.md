# @fluidframework/clicker-functional

**clicker-functional** brings with it our support for React hooks! In this case, we use the useStateFluid hook to achieve the same goal as **clicker-simple-react**, but now as a functional component.

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
