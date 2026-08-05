---
"@fluid-experimental/property-changeset": minor
"@fluid-experimental/property-common": minor
"@fluid-experimental/property-dds": minor
"@fluid-experimental/property-properties": minor
"__section": other
---
PropertyDDS packages now target ES2022

The TypeScript compilation `target` and `lib` for the PropertyDDS packages have been raised from ES2021/ES2020 to **ES2022**.
The published JavaScript now uses ES2022 language features (with correspondingly less down-leveling), so consuming these packages requires a runtime that supports ES2022.
All actively supported Node.js versions (18+) and evergreen browsers already meet this requirement.

These packages continue to compile with `useDefineForClassFields` disabled (the pre-ES2022 default), preserving their existing class field semantics.
No other API or behavioral changes are intended; this only affects the ECMAScript level of the emitted code.
