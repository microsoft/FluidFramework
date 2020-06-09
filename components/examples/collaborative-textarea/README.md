# @fluid-example/collaborative-textarea

**Collaborative TextArea** is a basic example that creates a SharedString and uses the react CollaborativeTextArea
component to launch a basic collaborative HTML `<textarea>`

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

Collaborative TextArea uses the following distributed data structures:

- SharedDirectory - root
- SharedString - stores the text
