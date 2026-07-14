---
"@fluid-tools/build-cli": patch
"__section": fix
---

Generate build performance dashboards without loading Chart.js from a public CDN.

The dashboard generator now inlines its installed Chart.js dependencies so generated dashboards are fully self-contained.
