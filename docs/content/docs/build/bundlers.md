---
title: Fluid and Bundlers
aliases:
  - "/build/bundlers/"
---

This article describes some known issues with bundlers and answers some commonly asked questions about the Fluid
Framework and bundlers.

## Known Errors with Webpack 5
The Fluid Framework uses some node.js core modules that do not exist in the browser. Webpack 4 and below used to include polyfills for node.js core modules by default. This is no longer the case in Webpack 5 and beyond, so these modules must be added to your project and Webpack 5 config.

This issue causes bundling any project that uses these libraries to fail. We now have to manually install the missing libraries and add the fallback.

To fix this take these steps:

1. Run the command `npm install -D <library>`
2. In the webpack.config.js file, add the following `fallback` property to the `resolve` object:

    ```javascript
    fallback: {
            "<library>": require.resolve("<library>/")
        }
    ```

    Add an additional `"<library>"` property to the `fallback` object for each of the four problematic libraries that you are using. An example of this is located [here](https://github.com/microsoft/FluidFramework/blob/a4c38234a920abe9b54b1c26a14c0a8e430cd3fa/packages/tools/webpack-fluid-loader/webpack.config.js#L37)

Error when trying to bundle our project:
```bash
BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.
This is no longer the case. Verify if you need this module and configure a polyfill for it.

If you want to include a polyfill, you need to:
        - add a fallback 'resolve.fallback: { "<library>": require.resolve("<library>/") }'
        - install '<library>'
If you don't want to include a polyfill, you can use an empty module like this:
        resolve.fallback: { "<library>": false }
```
