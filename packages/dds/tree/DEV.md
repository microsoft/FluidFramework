# Developer Notes

## Tree

See [SharedTree Tree-Shaking Architecture](./tree-shaking.md) for the optional-feature composition model, subsystem diagrams, and guidance for adding tree-shakable features.
New SharedTree runtime features that must be independently tree-shakable must use the provider-injection pattern documented there.
Do not add feature-specific configured factories or factories for combinations of optional features.

### Optional history recovery

`TreeCheckout` depends on the provider contract in `revertibleSupport.ts`.
The enabled implementation owns revertible maps, retained commit branches, inversion, rebasing,
cloning, disposal, and `revertTo` behavior in `revertibleSupportEnabled.ts`.
The disabled implementation allocates no retained history and returns no revertible factory from
changed events; explicit history-recovery calls throw a `UsageError`.

Support selection is propagated to forks and independent checkouts.
Applications that need to exclude enabled history recovery from their shipped bundle must use
`configuredSharedTreeWithFeaturesAlpha` and omit `revertibleSupport`.
The explicit factory uses disabled implementations for omitted features; applications import and
pass only the enabled providers they need.
Passing a disabled provider through the default configured factory does not establish the same
composition-root guarantee because that factory imports enabled support as its default.
Reverts remain ordinary local changes, so selecting either provider has no wire-format or summary
format impact.

The emitted-artifact probes in `examples/utils/bundle-size-tests` verify that the no-history
explicit composition cannot reach `revertibleSupportEnabled.js`.
