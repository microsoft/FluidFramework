# Literate Loader

Highly commented sample code of how to create your own loader. We wrap a lot of this code inside of datastore and
other libraries - so those may be the better choice to start with when building your own - but this one shows all
steps of the loader and reasoning why each part is necessary and so will give a full picture.

## Build steps

The hardest part is to authenticate against our private npm repository stored on VSTS.

```
npm i
npm run build
```
