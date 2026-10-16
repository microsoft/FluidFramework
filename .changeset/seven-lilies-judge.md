---
"@fluidframework/quill-react": minor
"__section": other
---
The Quill views now use quill-next and no longer need a DOM at import time

The Quill-based views now depend on `quill-next` instead of `quill`, and on `@quill-next/delta-es` instead of `quill-delta`.
Unlike `quill`, `quill-next` does not access the DOM when it is imported.
You no longer need to set up JSDOM before you import this package in Node.js tests or server-side code.

If your application imports Quill assets, such as theme stylesheets, from `quill`, import them from `quill-next` instead.
