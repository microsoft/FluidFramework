## [0.13.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.12.0...build-tools_v0.13.0) (2023-03-22)

### Features

* **build-cli:** Add exec command ([#14635](https://github.com/microsoft/FluidFramework/issues/14635)) ([5898496](https://github.com/microsoft/FluidFramework/commit/5898496b743a58357bbaa0011d5754c3cce1758c))
* **check:policy:** Add setting to ignore single-package pnpm workspaces ([#14656](https://github.com/microsoft/FluidFramework/issues/14656)) ([ad72865](https://github.com/microsoft/FluidFramework/commit/ad72865d909fc7e5bdc7fb89b4d87fd8938a3fe5))


### Bug Fixes

* **bump:** Fix invalid flag configuration ([#14475](https://github.com/microsoft/FluidFramework/issues/14475)) ([e8d0193](https://github.com/microsoft/FluidFramework/commit/e8d0193536a12c5890bdea6ab719e1effa3a9b65))
* **policy-check:** Use correct package.json indentation ([#14481](https://github.com/microsoft/FluidFramework/issues/14481)) ([2ec5912](https://github.com/microsoft/FluidFramework/commit/2ec5912d0d2feac4237aa2418a60cb740ab9121a))
* **release:** Handle released dependency bumps ([#14669](https://github.com/microsoft/FluidFramework/issues/14669)) ([d33bee7](https://github.com/microsoft/FluidFramework/commit/d33bee7c6510775a84fd268662362ae22a423e8c))


## [0.12.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.10.0...build-tools_v0.12.0) (2023-03-08)

### Features

* **release:** Tag asserts separately from policy-check ([#14316](https://github.com/microsoft/FluidFramework/issues/14316)) ([eb5c849](https://github.com/microsoft/FluidFramework/commit/eb5c84979bb364220ab2969d36f5223ebe6cde74))

### Bug Fixes

* **generate:typetests:** Use cached baseline ([#14317](https://github.com/microsoft/FluidFramework/issues/14317)) ([5d90f7c](https://github.com/microsoft/FluidFramework/commit/5d90f7cdd66c71333e09f3e1232115b92218f3cd))
* **release:** Install dependencies if needed ([#14348](https://github.com/microsoft/FluidFramework/issues/14348)) ([f3e30e5](https://github.com/microsoft/FluidFramework/commit/f3e30e5415df63604a66709b6a0e26f96809801b))

### Build System

* **build-tools:** Remove postinstall step ([#14275](https://github.com/microsoft/FluidFramework/issues/14275)) ([bbee6e9](https://github.com/microsoft/FluidFramework/commit/bbee6e95d1604a63fe55ac1aa3aa6869ffc2e1b2))

### Code Refactoring

* Add new simple type test generator ([#14334](https://github.com/microsoft/FluidFramework/issues/14334)) ([c58c54a](https://github.com/microsoft/FluidFramework/commit/c58c54afae39f91948917d30162350828eb57c17))


## 0.11.0 (NOT RELEASED)

## [0.10.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.10.0...build-tools_v0.10.0) (2023-02-22)


### ⚠ BREAKING CHANGES

* **generate:typetests:** We now prefer external files for the typetest config, so when running, it will always output to the external config file, and will remove the package.json typeValidation node.

### Features

* **build-cli:** Allow ssh git remotes ([#14145](https://github.com/microsoft/FluidFramework/issues/14145)) ([175a51b](https://github.com/microsoft/FluidFramework/commit/175a51baeaf65775b40d3dc2320fa8b3f03ee6b9))
* **fluid-build:** Accepting monorepo path for build scope on fluid-build command line ([#14071](https://github.com/microsoft/FluidFramework/issues/14071)) ([29ab33c](https://github.com/microsoft/FluidFramework/commit/29ab33c04f55ab40eca45e1d702a157548769549))
* **bump:** Support interdependency bump types ([#14161](https://github.com/microsoft/FluidFramework/issues/14161)) ([8cc5b1e](https://github.com/microsoft/FluidFramework/commit/8cc5b1e55820896bdb84825f9874ea55bc8a81f3))
* **fluid-build:** Support external config ([#14215](https://github.com/microsoft/FluidFramework/issues/14215)) ([1fc3cbc](https://github.com/microsoft/FluidFramework/commit/1fc3cbc3e7cf1df5abf49da8665354c03236c929))
* **generate:typetests:** Move typetest config to external file ([#14222](https://github.com/microsoft/FluidFramework/issues/14222)) ([15f0080](https://github.com/microsoft/FluidFramework/commit/15f0080afc7573380dacb368a36c1eb82c300ca3))


### Bug Fixes

* **fluid-build:** Fix copyfile command line parsing blocking incremental build ([#14083](https://github.com/microsoft/FluidFramework/issues/14083)) ([72c30a7](https://github.com/microsoft/FluidFramework/commit/72c30a7e901e91e7d5d48560dad5d1a83bdd3f6e))
* **generate:typetests:** Fix null refs and clean up logging ([#14228](https://github.com/microsoft/FluidFramework/issues/14228)) ([94f39a6](https://github.com/microsoft/FluidFramework/commit/94f39a66ce1c440705b08866818e45485e6be53f)), closes [#14222](https://github.com/microsoft/FluidFramework/issues/14222)

## [0.9.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.9.0...build-tools_v0.9.0) (2023-02-08)


### Features

* **check:policy:** Add pnpm repo policies ([#14025](https://github.com/microsoft/FluidFramework/issues/14025)) ([4a76a06](https://github.com/microsoft/FluidFramework/commit/4a76a0688bc4f651a8b6d2a3b8dbe94481f4cc12))
* **fluid-build:** Enforce formatting in lint scripts ([#13735](https://github.com/microsoft/FluidFramework/issues/13735)) ([5b11ee4](https://github.com/microsoft/FluidFramework/commit/5b11ee402b6a5200eb99605b6e81e9b71c029f51))
* **release:** Include links to ADO pipelines in release tools ([#13764](https://github.com/microsoft/FluidFramework/issues/13764)) ([b65220d](https://github.com/microsoft/FluidFramework/commit/b65220dcb7f7386d03cfb47e601d884a3d09cf04)), closes [AB#2176](https://github.com/microsoft/AB/issues/2176)


### Bug Fixes

* **bump:deps:** Include peer dependencies when bumping deps ([#13761](https://github.com/microsoft/FluidFramework/issues/13761)) ([d1e86ad](https://github.com/microsoft/FluidFramework/commit/d1e86ad9643d94765b93cfe5005478e225f3269a))
* **generate:typetests:** Skip tests when previousVersion is invalid ([#13999](https://github.com/microsoft/FluidFramework/issues/13999)) ([ad34e58](https://github.com/microsoft/FluidFramework/commit/ad34e58181b180857e6a3dead1aebc5a5dd4e87c))
* **release:report:** Display dates in full release report ([#13763](https://github.com/microsoft/FluidFramework/issues/13763)) ([330e6b7](https://github.com/microsoft/FluidFramework/commit/330e6b7b786edb59e5a5a43fb2a3862af8863fb6)), closes [AB#2198](https://github.com/microsoft/AB/issues/2198)


### Performance Improvements

* **fluid-build:** Reduce package check noise by scoping to only packages to be built ([#14067](https://github.com/microsoft/FluidFramework/issues/14067)) ([7505327](https://github.com/microsoft/FluidFramework/commit/750532753bf9f2fbcd2e94cab7506fbb7122e698))

## [0.8.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.8.0...build-tools_v0.8.0) (2023-01-24)


### Bug Fixes

* **check:policy:** Ignore packages that don't have pre-requisite scripts ([#13699](https://github.com/microsoft/FluidFramework/issues/13699)) ([9a2668c](https://github.com/microsoft/FluidFramework/commit/9a2668c4ddb15d0d3d8481b742fa63f25c28a8f1))
* **generate:typetests:** Generate using prepped data when branch has no config ([#13674](https://github.com/microsoft/FluidFramework/issues/13674)) ([5c8a2fa](https://github.com/microsoft/FluidFramework/commit/5c8a2fa27f5d65284d606a060a2d25bf9d0537a2))
* **run:bundleStats:** Remove logging deps ([#13769](https://github.com/microsoft/FluidFramework/issues/13769)) ([112be91](https://github.com/microsoft/FluidFramework/commit/112be919ca76c2e4acf4a0226a7e9a950b87f63b))

## [0.7.1](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.7.1...build-tools_v0.7.1) (2023-01-17)


### Bug Fixes

* **check:policy:** fix handling of assert short codes in policy ([#13317](https://github.com/microsoft/FluidFramework/issues/13317)) ([9bfd9e3](https://github.com/microsoft/FluidFramework/commit/9bfd9e39035920e3c144fedac9af92fdd24bdd50))

## [0.7.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.7.0...build-tools_v0.7.0) (2022-12-08)


### ⚠ BREAKING CHANGES

* **run:bundleStats:** The `--dirname` argument has been removed. There is now
a `--dangerfile` argument that defaults to the built-in dangerfile but
can be customized if needed.

### Bug Fixes

* **build-tools:** Use local policy-check in build-tools ([#13145](https://github.com/microsoft/FluidFramework/issues/13145)) ([e9b8590](https://github.com/microsoft/FluidFramework/commit/e9b8590647d21645dcfd31122e3d3af5763fb0e3))
* **run:bundleStats:** Take path to dangerfile instead of directory ([#13154](https://github.com/microsoft/FluidFramework/issues/13154)) ([0372fe0](https://github.com/microsoft/FluidFramework/commit/0372fe000991e324907d3e6342d6f72a49dfcb50))

## [0.6.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.5.0...build-tools_v0.6.0) (2022-11-28)


### ⚠ BREAKING CHANGES

* **generate:typetests:** `fluid-type-validator` is deprecated. Use `flub
generate typetests` instead.
* **release:report:** The `--all` and `--limit` flags have been removed from
`flub release report`. Use `flub release history` instead.

### Features

* **fluid-build:** Enable fluid-build to use pnpm and yarn ([#12874](https://github.com/microsoft/FluidFramework/issues/12874)) ([ee53e3b](https://github.com/microsoft/FluidFramework/commit/ee53e3be2708a1b37a7eac97d78ac25e18caa8e3)), closes [#12236](https://github.com/microsoft/FluidFramework/issues/12236)
* **generate:typetests:** Add --branch flag to typetest generator ([#13018](https://github.com/microsoft/FluidFramework/issues/13018)) ([3a50b02](https://github.com/microsoft/FluidFramework/commit/3a50b022b6c1363eb5a3cbdb86261996bfaffefe))
* **generate:typetests:** Make type tests configurable per-branch ([#12849](https://github.com/microsoft/FluidFramework/issues/12849)) ([8c29adc](https://github.com/microsoft/FluidFramework/commit/8c29adc6d23407700303a5f86b023ee1dd91d072))


### Bug Fixes

* **build-tools:** Add missing dependency ([#12979](https://github.com/microsoft/FluidFramework/issues/12979)) ([b9d33cf](https://github.com/microsoft/FluidFramework/commit/b9d33cfc59b5d00adbebb596da9852bb48cab0a2)), closes [#12849](https://github.com/microsoft/FluidFramework/issues/12849)
* **build-tools:** Load workspaceGlobs from pnpm properly ([#13083](https://github.com/microsoft/FluidFramework/issues/13083)) ([2f162b6](https://github.com/microsoft/FluidFramework/commit/2f162b61705aa6395298a7adb32c86f4e5590d78))
* **fluid-build:** Parse build-cli tasks properly in fluid-build ([#12988](https://github.com/microsoft/FluidFramework/issues/12988)) ([2217e3d](https://github.com/microsoft/FluidFramework/commit/2217e3d6ef2a9093cb77aa7486b613d5c0884ad1))


### Code Refactoring

* **release:report:** Split release report commands  ([#12850](https://github.com/microsoft/FluidFramework/issues/12850)) ([0678fd2](https://github.com/microsoft/FluidFramework/commit/0678fd29a4207f7090d8fe6301f5910597b3adde))

## [0.5.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.4.8000...build-tools_v0.5.0) (2022-11-04)


### ⚠ BREAKING CHANGES

* **bump:deps:** The `-p` flag has been changed to specify a package
name, which is consistent with
other commands. Use `--prerelease` to replace former uses of `-p`.
* **check:layers:** The `--info` flag is now required.

### Features

* **build-cli:** Add --exact flag to bump command ([#12667](https://github.com/microsoft/FluidFramework/issues/12667)) ([4121187](https://github.com/microsoft/FluidFramework/commit/4121187e77a1c9be34a41138a7254e32e14af149))
* **build-cli:** Add `merge info` command ([#12437](https://github.com/microsoft/FluidFramework/issues/12437)) ([6bceb77](https://github.com/microsoft/FluidFramework/commit/6bceb7762398bd4b42396b77e67773fd3958d87b))
* **build-cli:** Add autocomplete support for bash and zsh ([#12748](https://github.com/microsoft/FluidFramework/issues/12748)) ([429840d](https://github.com/microsoft/FluidFramework/commit/429840df20faca04bf48fea4131c65da5d882c69))
* **build-cli:** Add handler exclusion and listing to check policy command ([#12648](https://github.com/microsoft/FluidFramework/issues/12648)) ([0435b82](https://github.com/microsoft/FluidFramework/commit/0435b82ec14e81aa7ebfd46e30a8bdfb4080d512))
* **build-tools:** Add conventional commits deps and helper script ([#12261](https://github.com/microsoft/FluidFramework/issues/12261)) ([e7c61a0](https://github.com/microsoft/FluidFramework/commit/e7c61a043bcf64d724319a95f7df5ba4695db482))
* **fluid-build:** Support pnpm-workspace.yaml as workspace source ([#12252](https://github.com/microsoft/FluidFramework/issues/12252)) ([45c9f4f](https://github.com/microsoft/FluidFramework/commit/45c9f4fb191fd04e95cc19d4e90756ca3aa93e78))
* **check:policy:** Add policy handler to check for extraneous lockfiles ([#12726](https://github.com/microsoft/FluidFramework/issues/12726)) ([a477941](https://github.com/microsoft/FluidFramework/commit/a4779411b17a2d459ae885e896e98265b143eb1a)), closes [#9956](https://github.com/microsoft/FluidFramework/issues/9956)
* **check:policy:** Add policy to check for correct dependency types ([#12724](https://github.com/microsoft/FluidFramework/issues/12724)) ([fe6d4c2](https://github.com/microsoft/FluidFramework/commit/fe6d4c2985ff23b8f7ecfc532abe2728501e79dc)), closes [/github.com/microsoft/FluidFramework/pull/9966#discussion_r853523526](https://github.com/microsoft//github.com/microsoft/FluidFramework/pull/9966/issues/discussion_r853523526)
* **generate:typetests:** Configurable type test generation ([#12507](https://github.com/microsoft/FluidFramework/issues/12507)) ([e3506f8](https://github.com/microsoft/FluidFramework/commit/e3506f8cad0f43860c3b5bb17f2bd2b76290d8d8))


### Bug Fixes

* **build-cli:** Add baseline version and normalize JSON ([#12682](https://github.com/microsoft/FluidFramework/issues/12682)) ([29236f9](https://github.com/microsoft/FluidFramework/commit/29236f9ecb548842cff6972653ea88b7c37d116a))
* **build-cli:** Add option to include .generated in type test file names ([#12717](https://github.com/microsoft/FluidFramework/issues/12717)) ([21b171b](https://github.com/microsoft/FluidFramework/commit/21b171b620ec56024eb16bc2ab0c6110a0f6daef))
* **build-cli:** Allow prerelease as a valid value for release argument ([#12479](https://github.com/microsoft/FluidFramework/issues/12479)) ([0dc04f0](https://github.com/microsoft/FluidFramework/commit/0dc04f0cc5cb082390cf1621c132dd949caf991f))
* **build-cli:** Check assets properly in generate bundleStats command ([#12691](https://github.com/microsoft/FluidFramework/issues/12691)) ([54b358e](https://github.com/microsoft/FluidFramework/commit/54b358e4e74286de12a25106e5e8020c5911d337))
* **build-cli:** Check the root package.json of a release group when updating dependencies ([#12381](https://github.com/microsoft/FluidFramework/issues/12381)) ([8f7df28](https://github.com/microsoft/FluidFramework/commit/8f7df28992e1c96b15b15c90cb7e9769d9792cde))
* **build-cli:** Consistent commit messages for dep bumps ([#12357](https://github.com/microsoft/FluidFramework/issues/12357)) ([9f12dca](https://github.com/microsoft/FluidFramework/commit/9f12dca5c423d677dd5a88e80984f018f64bc471))
* **build-cli:** Exclude independent packages when bumping release groups ([#12652](https://github.com/microsoft/FluidFramework/issues/12652)) ([cfe3c9d](https://github.com/microsoft/FluidFramework/commit/cfe3c9d41fe9afa2fa23e0805d2cffccc3c257fa))
* **build-cli:** policy-check should only run on main by default ([#12458](https://github.com/microsoft/FluidFramework/issues/12458)) ([dab6b05](https://github.com/microsoft/FluidFramework/commit/dab6b052e0944cddef74119102c6c7db9f8ec1cc))
* **build-cli:** Read layer config file without using require() ([#12689](https://github.com/microsoft/FluidFramework/issues/12689)) ([712016f](https://github.com/microsoft/FluidFramework/commit/712016f1fd1dd9737d551524e466a042b5274a0f))
* **build-cli:** Require versionConstraint flag in generate:typetests ([#12582](https://github.com/microsoft/FluidFramework/issues/12582)) ([91317a9](https://github.com/microsoft/FluidFramework/commit/91317a9c5736dc89c3a93bb890af67e330737873))
* **build-tools:** Bump cmd detects ver scheme ([#12311](https://github.com/microsoft/FluidFramework/issues/12311)) ([20ee489](https://github.com/microsoft/FluidFramework/commit/20ee4890bdbd24d31bdff8b8d4ea669080196564))
* **build-tools:** Generate commit messages for bumps consistently ([#12317](https://github.com/microsoft/FluidFramework/issues/12317)) ([cf28fbd](https://github.com/microsoft/FluidFramework/commit/cf28fbd11225c3c3d5792bb6dee2ead33c74fc3e))
* **build-tools:** Make the default bundle directory deterministic in docs ([#12325](https://github.com/microsoft/FluidFramework/issues/12325)) ([9617d1a](https://github.com/microsoft/FluidFramework/commit/9617d1aaeed4f8632c822f78b59ee9123b1af185)), closes [AB#1961](https://github.com/microsoft/AB/issues/1961)
* **bump:** Fix detection of version scheme for internal/dev builds ([#12755](https://github.com/microsoft/FluidFramework/issues/12755)) ([9b7f2b4](https://github.com/microsoft/FluidFramework/commit/9b7f2b45969c7f2be85ae566d343643c2a4f52f8))
* **bump:** Fix detection of version scheme for test builds ([#12758](https://github.com/microsoft/FluidFramework/issues/12758)) ([00f660b](https://github.com/microsoft/FluidFramework/commit/00f660b0da1c0922425174b016b4bd9a89890408))
* **fluid-build:** Support flub generate typetests tasks in fluid-build ([#12732](https://github.com/microsoft/FluidFramework/issues/12732)) ([99a6c65](https://github.com/microsoft/FluidFramework/commit/99a6c65cdba45aa7bb8c276a2e57808cdccbfd49))
* **policy-check:** Make check policy continue after errors ([#12373](https://github.com/microsoft/FluidFramework/issues/12373)) ([edb1d84](https://github.com/microsoft/FluidFramework/commit/edb1d84e276ea6797c47b4af43bad68279ffbf4e))
* **version-tools:** Correct handling of internal dev/prerelease versions ([#12734](https://github.com/microsoft/FluidFramework/issues/12734)) ([5ba0ee9](https://github.com/microsoft/FluidFramework/commit/5ba0ee99b5eaa1033eb50fe31e25c2580ed3e3c7)), closes [#12721](https://github.com/microsoft/FluidFramework/issues/12721)
* **version-tools:** Relax handling of internal dev/prerelease versions ([#12721](https://github.com/microsoft/FluidFramework/issues/12721)) ([ac51c35](https://github.com/microsoft/FluidFramework/commit/ac51c355dd3891b3db04104627f3faee3a9686fa))


### Reverts

* **build-tools:** Include ".generated" in typetest filenames ([#12571](https://github.com/microsoft/FluidFramework/issues/12571)) ([82637e0](https://github.com/microsoft/FluidFramework/commit/82637e0b3ec8cdd9aefee9775cdc1b1bc7de7f47))
* **build-tools:** revert downgrade lerna to v4 ([#12580](https://github.com/microsoft/FluidFramework/issues/12580)) ([a9b0650](https://github.com/microsoft/FluidFramework/commit/a9b065009e9e3187de4019b67efba96b6a9198d9)), closes [#12563](https://github.com/microsoft/FluidFramework/issues/12563)

### [0.4.8000](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.4.7000...build-tools_v0.4.8000) (2022-10-13)

### [0.4.7000](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.4.6000...build-tools_v0.4.7000) (2022-10-06)

### [0.4.6000](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.4.5000...build-tools_v0.4.6000) (2022-09-16)
