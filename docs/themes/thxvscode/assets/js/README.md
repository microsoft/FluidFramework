# JS assets

If this JS code is changed, the bundle.js file needs to be recompiled.

To recompile the JS bundle file:

```bash
yarn install
yarn build
```

The baseof template then takes the bundle.js file and process it (minify + fingerprint it) and loads it in the rendered pages.