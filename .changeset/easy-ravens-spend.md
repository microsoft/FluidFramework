---
"@fluid-experimental/property-common": minor
"__section": fix
---
Correct some PropertyDDS "MSG" error constant entries

Several error constants referenced in other PropertyDDS packages did not exist and would produce errors with "undefined" (literal) in error message string.
In the past:
 - `OVERRIDEN_PROP_MUST_HAVE_SAME_CONTEXT_AS_BASE_TYPE` use was replaced by `OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE` (but never defined).
 - `CANNOT_INSERT_UNKNOWN_PROPERTY`, `MISMATCHING_PROPERTY_TYPEID`, and `CANNOT_REMOVE_NON_OPTIONAL_PROP` uses were added without defining them.

Those all are now defined `MSG` properties.
