# Developer Notes

## Tree

### Optional history recovery

`TreeCheckout` depends on the provider contract in `revertibleSupport.ts`.
The enabled implementation owns revertible maps, retained commit branches, inversion, rebasing,
cloning, disposal, and `revertTo` behavior in `revertibleSupportEnabled.ts`.
The disabled implementation allocates no retained history and returns no revertible factory from
changed events; explicit history-recovery calls throw a `UsageError`.

Support selection is propagated to forks and independent checkouts.
Applications that need to exclude enabled history recovery from their shipped bundle must use
`configuredSharedTreeWithoutHistoryAlpha`; passing a disabled provider through the general
configured factory does not establish the same composition-root guarantee.
Reverts remain ordinary local changes, so selecting either provider has no wire-format or summary
format impact.

The emitted-artifact probes in `examples/utils/bundle-size-tests` verify that the no-history
SharedTree factory cannot reach `revertibleSupportEnabled.js`.
