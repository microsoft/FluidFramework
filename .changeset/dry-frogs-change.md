---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": fix
---
Fixed bug in parsing sensitivity label information from the ODSP join session response

Fixes parsing of sensitivity label information in the ODSP join session response. If there had been sensitivity label data present in the ODSP response, this data would have been double-parsed, leading to runtime errors. This issue was so far not hit in practice, because ODSP did not roll out sensitivity labels in the response yet. This bug fix gets us ready for that rollout, which is planned to happen soon.
