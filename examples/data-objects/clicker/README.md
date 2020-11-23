# @fluid-example/clicker

**Clicker** is a Fluid object that displays a number with a button. Pressing the button
increments the counter. This is a basic example using the interface model and stock
classes.

**Clicker** also demonstrates how use the built in taskManager to setup a simple agent.


There is another experimental implementation of Clicker using a WiP Fluid React Component in components/experimental/clicker-react. While it uses a state update model instead of an event-listening model that some React developers may find more familiar, the code is still being developed and may contain bugs.

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

## Data model

Badge uses the following distributed data structures:

- SharedDirectory - root
