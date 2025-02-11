---
---
---
"section": other
---

Target ES2021

The TypeScript build for Fluid Framework packages has been updated to target ES2021 instead of ES2020.
This may result in newer JavaScript language features being used.
This does not change TypeScript types, nor the JavaScript libraries being used.
We only support users which support ES2022, so updating to target ES2021 should not break any supported use-case.
Any users which do not have at least ES2021 language feature support may need to transpile out some additional cases after this change.

This should result in slightly reduced bundle size and slightly improved performance for users not transpiling these features out.
No major impact is expected.
