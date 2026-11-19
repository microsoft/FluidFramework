---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix a memory leak where rewinding a view kept old history forever

[rewindTo](https://fluidframework.com/docs/api/tree/untypedtreeviewalpha-interface#rewindto-methodsignature) now disposes the branch it replaces, as its documentation says.
Before this fix, the replaced branch stayed alive and kept SharedTree from trimming old history.
That history stayed in memory for as long as the tree was loaded, even after the view was disposed.
