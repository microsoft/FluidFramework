# @fluid-example/clicker-with-hook

**Clicker** is a Fluid object that displays a number with a button. Pressing the button
increments the counter. This is a basic example that uses the synced counter hook.

**Clicker-With-Hook** contains an implementation of Clicker using the useSyncedCounter hook

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- AUTO-GENERATED-CONTENT:END -->

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
