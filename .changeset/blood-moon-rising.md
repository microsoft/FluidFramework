---
"@fluid-experimental/property-query": minor
---

Updated `joi` dependency to latest major version

The `joi` dependency was updated from 14.3.1 to 17.3.1 to address a critical vulnerability exploit [CVE-2020-36604](https://github.com/advisories/GHSA-c429-5p7v-vgjp). This required updating the use of `joi` schema validation function within `property-query` to the new major version syntax.
