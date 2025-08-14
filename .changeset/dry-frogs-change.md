---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": fix
---
Fixed bug in parsing sensitivity label information from the ODSP join session response.

Fixes parsing of sensitivity label information in the ODSP join session response. So this was double-parsed, leading to runtime errors when sensitivity label information was actually present. Sensitivity label information was so far not present in the ODSP response, but will be rolled out soon.