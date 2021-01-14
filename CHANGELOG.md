# Change Log

## 0.19.2

* chore: Add dispose functionality to FluidDocumentStore, Checkout and SharedTree
  * Associated pull request: !26952
* build: update fluid to 0.32.1
  * Associated pull request: !27217
* run api extractor
* fix lint errors
* move handler to contstructor
* chore: Cleanup of shared-tree resulting from development tooling
  * Associated pull request: !27186
* improvement: ensure payloads do not appear as a property when empty
  * Associated pull request: !27166
* chore: Added API documentation generation to the build + misc. tooling cleanup
  * Associated pull request: !27148
* code review updates
* remove dispose from basiccheckout as it has been added to parent abstract class
* Squashed 'packages/shared-tree/' changes from 13a0d61e6..fa5bc426b
* test: Add unit tests for LogViewer
  * Associated pull request: !26985
* improvment: minor forest related code cleanup and normalize package-lock
  * Associated pull request: !27083
* build: Add missing dev dependencies in `fluid-document-store` and `shared-tree`
  * Associated pull request: !27097
* docs: Merged changes from wikiMaster
  * Associated pull request: !27077
* docs: Fixed mermaid syntax
* merge: merge releases/2021.01.2 into master
  * Associated pull request: !27067
* improvement: invalidate the dependents of all nodes within deleted document subtrees
  * Associated pull request: !26984

## 0.17.1

_Version update only._

## 0.16.0

* Merged PR 26944: Factor out NodeData
* fix: Correct shared-tree lint configuration to not pick up Whiteboard settings
  * Associated pull request: !26987
* run API extractor
* Merge branch 'master' of https://intentional.visualstudio.com/intent/_git/typescript-pipe into user/coclauso/update-fluid-packages
* ChangeNodeSequence -> TreeNodeSequence
* Fix lint/formatting
* Node -> TreeNode
* Add doc comment
* One more location
* Utility function for asserting no delta
* clarify Node doc
* SnapshotNode extends NodeData
* Update Fluid packages
* Factor out NodeData
* Remove unwanted SharedTree events

## 0.14.0

* refactor: Rename core tree types
  * Associated pull request: !26681
* fix: Disable header/header lint rule expecting wrong header format
  * Associated pull request: !26642
* chore: Use copyright headers consistent with Fluid
  * Associated pull request: !26630
* fix: Properly run eslint on source files in shared-tree
  * Associated pull request: !26617

## 0.13.6

* docs: Update README.md
  * Associated pull request: !26546
* Rename Session To Checkout
* more clarity in PrefetchFilter comment
* fix comment duplication
* cleanup LoadedView
* improve PrefetchFilter comment
* referance #49101
* Referance #49100
* fix comment
* rename waitForPendingDownloads and fix build
* renames inside session
* comments and renames in LogViewer
* remove package export of BlobId
* fixes from merge
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* build: Adopt fluid build conventions in shared-tree
  * Associated pull request: !26350
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* refactor: cleanup delta codepath
  * Associated pull request: !26499
* fix lints
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* test: flush edits during documentStore tests
  * Associated pull request: !26356
* clarify cancel todo
* Apply suggestions from code review
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* Merge commit '9e887c4' into user/crmacomb/session
* Merge commit 'a73c428' into user/crmacomb/session
* Merge commit 'fd5499c' into user/crmacomb/session
* Merge commit '6c0bff7' into user/crmacomb/session
* Merge commit 'b15a962' into user/crmacomb/session
* Merge commit 'd259fb4' into user/crmacomb/session
* revert: Revert "Merged PR 26399: version: BREAKING CHANGE Update Fluid Framework packages to 0.30.0"
  * Associated pull request: !26479
* fix: Add unit tests for Transaction
  * Associated pull request: !26447
* feat: full edit group support
  * Associated pull request: !26300
* chore: minor tweaks from onboarding reading
  * Associated pull request: !26457
* fix: Assert against runtime.attachState in saveSummary
  * Associated pull request: !26459
* feat: Introduce more ergonomic change creation & editing APIs
  * Associated pull request: !26404
* version: BREAKING CHANGE Update Fluid Framework packages to 0.30.0
  * Associated pull request: !26399
* refactor: centralize and document all persisted types
  * Associated pull request: !26334
* add cache so walking trees when there are local edits is not super slow
* Split up session type
* remove: Remove tooling and configuration for running shared-tree tests in a browser
  * Associated pull request: !26321
* Apply suggestions from code review
* update api file
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* refactor: BREAKING CHANGE move non-persisted types out of EditLocation.ts
  * Associated pull request: !26332
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* Apply suggestions from code review
* refactor: Remove @intentional/framework dependency from shared-tree
  * Associated pull request: !26316
* better comment
* update framework version to support async document store factories
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* fix most tests
* fi: Update framework and test-utilities to 1.118.3
  * Associated pull request: !26240
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* fix: implement transactional edit groups in store
  * Associated pull request: !26078
* remove: Remove support for specifying a TraitLocation's parent via `parentNode`
  * Associated pull request: !26174
* fi: update framework and test-utilities to 1.118.1
  * Associated pull request: !26175
* rename: Rename trait and sibling field of Point
  * Associated pull request: !26180
* more docs
* fix tests
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* lint
* PR feedback
* Merge branch 'user/taylorsw/LongRunningTransactions' of https://intentional.visualstudio.com/intent/_git/whiteboard-collaboration into user/taylorsw/LongRunningTransactions
* PR feedback
* Apply suggestions from code review
* PR feedback
* Merge branch 'user/taylorsw/LongRunningTransactions' of https://intentional.visualstudio.com/intent/_git/whiteboard-collaboration into user/taylorsw/LongRunningTransactions
* Apply suggestions from code review
* Merge remote-tracking branch 'origin/master' into user/taylorsw/LongRunningTransactions
* store payload cache on shared tree
* Merge remote-tracking branch 'origin/master' into user/crmacomb/session
* get tests passing
* refactor: Support parents being specified as parentNode or parent in EncodedTraitLocation
  * Associated pull request: !26145
* Merged PR 26080: BREAKING CHANGE: feat: implement setValue in SharedTree
* Add test for failed rebase
* Merge branch 'user/taylorsw/LongRunningTransactions' of https://intentional.visualstudio.com/intent/_git/whiteboard-collaboration into user/taylorsw/LongRunningTransactions
* Apply suggestions from code review
* PR feedback
* Merge remote-tracking branch 'origin/master' into user/taylorsw/LongRunningTransactions
* refactor: BREAKING CHANGE split out getRevisionView
  * Associated pull request: !26020
* Apply suggestions from code review
* add shared tree expensiveValidation
* Merge branch 'user/crmacomb/getRevisionView' of https://dev.azure.com/intentional/intent/_git/whiteboard-collaboration into user/crmacomb/getRevisionView
* fix comment on loadKnownRevision
* Apply suggestions from code review
* dedup some loading logic
* test: Add more unit tests for EditLog
  * Associated pull request: !26048
* test: Additional EditLog unit tests
  * Associated pull request: !26027
* Add explicit update method
* fi: update framework and test-utilities to 1.116.1
  * Associated pull request: !26025
* Merge remote-tracking branch 'origin/master' into user/taylorsw/LongRunningTransactions
* build: update deps
  * Associated pull request: !26008
* refactor: split out getRevisionView
* better naming
* support long-running transactions

## 0.10.5

* docs: Update changelog
* chore: Update to recent versions of Fluid packages
  * Associated pull request: !25957
* refactor: BREAKING CHANGE require local changes to be valid, and refactor RevisionViewEditor into Transaction
  * Associated pull request: !25907
* fix: Support different summarizing schemes
  * Associated pull request: !25826
* Apply suggestions from code review
* fix tests, and expand docs
* fix merge
* Merge remote-tracking branch 'origin/master' into user/crmacomb/sharedtreeInval
* update api file
* assert on invalid index, and beter comments
* document local edits in saveSummary
* clarify revisions
* refactor: BREAKING CHANGE remove abbreavation and do revisions in terms of EditId
* fix bugs caught by tests
* fix
* fi: update framework and test-utilities to 1.114.1
  * Associated pull request: !25847
* refactor: clarify invalidation in SharedTree
* feat: add constraint support
  * Associated pull request: !25822
* fix: Correctly initialize allEdits map in EditLog constructor
  * Associated pull request: !25792
* refactor: Restrict public API for SharedTree edit history
  * Associated pull request: !25781
* test: Change move and insert edit creation test helper signatures to be more readable
  * Associated pull request: !25758
* refactor: Make Change a discriminated union over the 'type' field
  * Associated pull request: !25745
* fix: Summaries created before attachment sequence local edits
  * Associated pull request: !25762
* refactor: Change list is represented by EditLog
  * Associated pull request: !25729
* fi: update to framework 1.112.2 and schemagen 5.0218822-olympia
  * Associated pull request: !25680

## 0.6.0

* refactor: Cleanup SharedTree state object
  * Associated pull request: !25656
* fix: BREAKING CHANGE create shared-trees in a valid state with a default tree
  * Associated pull request: !25638
* test: Add a test for initialization of SharedTree with an empty edit list
  * Associated pull request: !25569
* fix: fix deleting of subtrees in forest
  * Associated pull request: !25581
* Merge remote-tracking branch 'origin/master' into jennle/test-initialize
* test: Add test for empty edit list initialization
* Fix: Fixes SharedTree initialization error in Whiteboard due to logic error
  * Associated pull request: !25567
* refactor: BREAKING CHANGE cleanup Edit types and docs
  * Associated pull request: !25541
* fi: update to framework 1.108.2
  * Associated pull request: !25511
* refactor: BREAKING CHANGE rename whiteboard-collaboration package to shared-tree
  * Associated pull request: !25482

## 0.4.0

* build: update deps and use stable version of framework, adding it as peer
  * Associated pull request: !25037
* docs: add readme to shared tree
  * Associated pull request: !25012
* build: fix up linter settings
  * Associated pull request: !25000
* refactor: Distinguish EditNode from Node
  * Associated pull request: !25001
* refactor: tag Changes with their type for easier type checking
  * Associated pull request: !24998
* build: unify tsconfigs
  * Associated pull request: !24996
* perf: Make Forest immutable
  * Associated pull request: !24988
* lint
* Merge remote-tracking branch 'origin/master' into user/neck/removeEditAdvanced
* small doc fix
* build: update deps
  * Associated pull request: !24981
* fix: Add lerna bootstrap to post-install
  * Associated pull request: !24980
* PR Feedback
* mend
* merge
* fix: RevisionViews may now create build edits that contain detached subtrees
  * Associated pull request: !24943
* nit
* refactor
* Merge branch 'user/neck/resolveDetachedNodes' into user/neck/removeEditAdvanced
* smol
* WIP
* WIP
* add test for multiparenting
* Process descendant detached nodes and add test

## 0.3.1

* feat: Allow serialization of uninitialized SharedTrees
  * Associated pull request: !24904
* refactor: Organize state in SharedTree by lifetime
  * Associated pull request: !24883
* feat: add applyEdit helper to SharedTree
  * Associated pull request: !24892
* feat: SharedTree includes the current tree view in its summary/snapshot
  * Associated pull request: !24871
* feat: Added initialTree to summary and added summary tests
  * Associated pull request: !24806
* fix: Remove references to ChangeStream from SharedTree
  * Associated pull request: !24865
* ci: Fix publish error due to git changes in npmrc
  * Associated pull request: !24854
* feat: BREAKING CHANGE Add multi-package support using lerna
  * Associated pull request: !24756
