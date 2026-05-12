---
"@fluidframework/odsp-driver": patch
"__section": other
---
Remove fully-rolled-out `setSensitivityLabelHeaderPostFix` config gate

The `Fluid.Driver.Odsp.setSensitivityLabelHeaderPostFix` config gate is fully rolled out, so it has been removed along with the now-dead conditional code path. The `Prefer: Return-Sensitivity-Labels` header is now always sent on join-session requests, matching the post-rollout production behavior. The `setSensitivityLabelHeader` property emitted on the `JoinSession` telemetry event has also been removed because it would always be `true`.
