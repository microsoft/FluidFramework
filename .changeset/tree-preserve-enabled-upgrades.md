---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Schema upgrades preserve already-enabled staged changes

Schema upgrades now preserve already-enabled staged allowed types and optionality at each stored location, even when the view's staged-upgrade policy does not enable those changes.
Previously, the default restrictive policy could cause an upgrade to be rejected because its proposed schema excluded changes already enabled in the document.
The policy now controls only which new staged changes are introduced when upgrading a schema.

Preservation does not enable a shared upgrade token at additional locations.
If a token is only partially enabled, explicitly enable it with [`StagedSchemaUpgradePolicy.enabledStagedUpgrades(token)`](https://fluidframework.com/docs/api/fluid-framework/stagedschemaupgradepolicyfactory-interface#enabledstagedupgrades-methodsignature) to apply it at the remaining locations.

The alpha `StagedSchemaUpgradePolicy.includeAlreadyEnabledUpgrades` option has been removed because preservation is now automatic.
