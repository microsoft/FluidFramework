---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---

Schema incompatibility explanations identify array structure

Schema incompatibility reasons now identify array elements instead of referring only to an empty field key.
When an upgrade changes between array and other stored structures, the reasons identify which schema has array structure.
Arrays still use an object representation in stored schemas, so structured node-kind values remain unchanged.
Compatibility decisions and upgrade permissions are unchanged.
