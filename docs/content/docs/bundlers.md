---
title: Fluid and Bundlers
aliases:
  - "/start/bundlers/"
---

The following are known bundler issues, answers to some of the most commonly asked questions about the Fluid
Framework and Bundlers.

## Known Errors with Webpack 5
We know the following packages cause errors; assert, buffer, events and url.

This issue causes compiling any project that uses these libraries to fail. Upgrading to Webpack 5 removed the automatic NodeJS polyfills. We now have to manually install the missing packages and add the fallback.

To fix this, run the command `npm install -D <package>` and add the fallback `resolve.fallback: { "<package>": require.resolve("<package>/") }` to the affected package's webpack.config.js. An example of this is located [here](https://github.com/microsoft/FluidFramework/blob/a4c38234a920abe9b54b1c26a14c0a8e430cd3fa/packages/tools/webpack-fluid-loader/webpack.config.js#L37)

Error:
```bash
BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.
This is no longer the case. Verify if you need this module and configure a polyfill for it.

If you want to include a polyfill, you need to:
        - add a fallback 'resolve.fallback: { "<package>": require.resolve("<package>/") }'
        - install '<package>'
If you don't want to include a polyfill, you can use an empty module like this:
        resolve.fallback: { "<package>": false }
```
