---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve SharedTree decoding performance

SharedTree decoding has been optimized.
Formatted-text benchmarks measured the following median decoding times on Node.js 22:

| Document size | Before | After | Time reduction |
| --- | ---: | ---: | ---: |
| 1,000 characters | 1.665 ms | 1.637 ms | 1.7% |
| 10,000 characters | 17.298 ms | 16.648 ms | 3.8% |
