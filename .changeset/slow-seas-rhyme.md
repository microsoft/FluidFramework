---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
---

Removed deprecated implementation of SingleRT feature which was enabled via enableShareLinkWithCreate boolean flag in HostStoragePolicy

Removed the deprecated logic of creating sharing-links with container attach (called SingleRT) which was enabled via enableShareLinkWithCreate flag in HostStoragePolicy. This change removes SharingLinkTypes interface definition, removes other deprecated properties from the odsp-driver's resolvedUrl object and also removes the enableShareLinkWithCreate flag. The newer version of SingleRT feature continues to exist, which can be enabled via enableSingleRequestForShareLinkWithCreate feature flag in HostStoragePolicy.
