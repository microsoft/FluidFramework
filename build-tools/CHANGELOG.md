## [0.50.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.49.0...build-tools_v0.50.0) (2024-11-04)


### Features

* **build-infrastructure:** Add default implementations for core interfaces ([#22865](https://github.com/microsoft/FluidFramework/issues/22865)) ([199b9d0](https://github.com/microsoft/FluidFramework/commit/199b9d051239d8dba8215153e565c2cadbc1ecef))
* **build-tools:** Add build-infrastructure package ([#22853](https://github.com/microsoft/FluidFramework/issues/22853)) ([b8e887e](https://github.com/microsoft/FluidFramework/commit/b8e887ead4e4a10c537e12fbe43d66ea83f7e25a))
* **build-tools:** Add generate:node10Entrypoints command ([#22937](https://github.com/microsoft/FluidFramework/issues/22937)) ([533de79](https://github.com/microsoft/FluidFramework/commit/533de791802eaa0eb0b55f8a222d38e9a0822741))


### Bug Fixes

* **build-tools:** Run install with `--no-frozen-lockfile` ([#22814](https://github.com/microsoft/FluidFramework/issues/22814)) ([0334d00](https://github.com/microsoft/FluidFramework/commit/0334d003b0e4876e4d3925002c863eeaa78177fb))
* **fluid-build:** Load default config when no config is found ([#22825](https://github.com/microsoft/FluidFramework/issues/22825)) ([8884365](https://github.com/microsoft/FluidFramework/commit/88843657f4be9fa1fa4fe5e0370b6f120ee3b090))
* **generate:changelog:** Calculate correct changeset version ([#22796](https://github.com/microsoft/FluidFramework/issues/22796)) ([91ace91](https://github.com/microsoft/FluidFramework/commit/91ace91767a56814ac51411eeb6d051c111adb20))
* **release:** Check release notes and changelog generation in release tool ([#22811](https://github.com/microsoft/FluidFramework/issues/22811)) ([2d98e6c](https://github.com/microsoft/FluidFramework/commit/2d98e6cc681ac39786510e659f62fa7606a1edff))
* Update transitive dependencies on `braces` to address CVE ([#22768](https://github.com/microsoft/FluidFramework/issues/22768)) ([4228a21](https://github.com/microsoft/FluidFramework/commit/4228a21d96a141f43dc24c74e22ca49cd8e14407))


### Build System

* **build-tools:** Upgrade danger to 12.x ([#22904](https://github.com/microsoft/FluidFramework/issues/22904)) ([0ec024d](https://github.com/microsoft/FluidFramework/commit/0ec024d3669adc4d75afd24daae9017593153db2))

## [0.49.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.48.0...build-tools_v0.49.0) (2024-10-14)


### Bug Fixes

* **generate:changelog:** Calculate correct changeset version ([#22796](https://github.com/microsoft/FluidFramework/issues/22796)) ([91ace91](https://github.com/microsoft/FluidFramework/commit/91ace91767a56814ac51411eeb6d051c111adb20))
* Update transitive dependencies on `braces` to address CVE ([#22768](https://github.com/microsoft/FluidFramework/issues/22768)) ([4228a21](https://github.com/microsoft/FluidFramework/commit/4228a21d96a141f43dc24c74e22ca49cd8e14407))

## [0.48.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.47.0...build-tools_v0.48.0) (2024-10-08)


### Features

* **fluid-build:** Add support for declarative tasks ([#22663](https://github.com/microsoft/FluidFramework/issues/22663)) ([082c72d](https://github.com/microsoft/FluidFramework/commit/082c72d4162619e8438e8adb42e07af1ce7f10eb))

## [0.47.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.46.0...build-tools_v0.47.0) (2024-10-04)


### Features

* **build-cli:** add check latestVersions command to build-tools ([#22252](https://github.com/microsoft/FluidFramework/issues/22252)) ([fc486fe](https://github.com/microsoft/FluidFramework/commit/fc486fe352b7f0fb192fcf1602160ee89c1248fd))
* **build-cli:** New command transform:releaseNotes ([#22466](https://github.com/microsoft/FluidFramework/issues/22466)) ([d2995da](https://github.com/microsoft/FluidFramework/commit/d2995daf42160d6bff68b53dc228b719d357d274))


### Bug Fixes

* **build-cli:** Load interdependency ranges from fluid-build config for back-compat ([#22628](https://github.com/microsoft/FluidFramework/issues/22628)) ([ad79bf6](https://github.com/microsoft/FluidFramework/commit/ad79bf6e63e4da44ee22625021f7ddacf6c4f3d3)), closes [#22630](https://github.com/microsoft/FluidFramework/issues/22630) [#21967](https://github.com/microsoft/FluidFramework/issues/21967) [#21967](https://github.com/microsoft/FluidFramework/issues/21967) [0#diff-9a0994a9d2ddb86f6f1e53fef4e8de22cf87ced6dd81bd0e8866784c2679f450L330](https://github.com/microsoft/0/issues/diff-9a0994a9d2ddb86f6f1e53fef4e8de22cf87ced6dd81bd0e8866784c2679f450L330)
* **build-tools:** correct deleted file status ([#22586](https://github.com/microsoft/FluidFramework/issues/22586)) ([40630fa](https://github.com/microsoft/FluidFramework/commit/40630fadb082f539819f4a702457c0926930d5b5)), closes [AB#6588](https://github.com/microsoft/AB/issues/6588)
* **build-tools:** use JSON5 to allow comments ([#22498](https://github.com/microsoft/FluidFramework/issues/22498)) ([11fe079](https://github.com/microsoft/FluidFramework/commit/11fe079b2a355ea9692d87e0565f645294e46bf3))
* **fluid-build:** Sort donefile file hashes deterministically ([#22665](https://github.com/microsoft/FluidFramework/issues/22665)) ([a9a07c6](https://github.com/microsoft/FluidFramework/commit/a9a07c66c9d920dadaba26b32884ae830c6a4ec2)), closes [#22663](https://github.com/microsoft/FluidFramework/issues/22663) [#22663](https://github.com/microsoft/FluidFramework/issues/22663)

## [0.46.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.45.0...build-tools_v0.46.0) (2024-09-13)


### Bug Fixes

* **generate:typetests:** Resolve symlinks to previous versions ([#22494](https://github.com/microsoft/FluidFramework/issues/22494)) ([90991c9](https://github.com/microsoft/FluidFramework/commit/90991c938b670b1ab219b36380ecf211e09087aa))

## [0.45.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.44.0...build-tools_v0.45.0) (2024-09-11)


### Features

* **build-cli:** New command check:prApproval ([#22302](https://github.com/microsoft/FluidFramework/issues/22302)) ([497501c](https://github.com/microsoft/FluidFramework/commit/497501c70366de78cfa79d0d560faaad3acd4b95)), closes [AB#8814](https://github.com/microsoft/AB/issues/8814)
* **build-cli:** New promote:package command ([#22305](https://github.com/microsoft/FluidFramework/issues/22305)) ([d545dd8](https://github.com/microsoft/FluidFramework/commit/d545dd8f71920e7f6a69145e5a37545020a7f0ef))
* **build-cli:** New re-usable flag for parsing version strings ([#22360](https://github.com/microsoft/FluidFramework/issues/22360)) ([0309a04](https://github.com/microsoft/FluidFramework/commit/0309a04ef6ec2c263283f54e2e969215b7899848))
* **generate:releaseNotes:** Add inline links to headings ([#22415](https://github.com/microsoft/FluidFramework/issues/22415)) ([1a4b95f](https://github.com/microsoft/FluidFramework/commit/1a4b95f7bfdba30e3b32b6efb0c89298dc6d30ed)), closes [AB#14174](https://github.com/microsoft/AB/issues/14174)
* **generate:typetests:** Add per-package typetest entrypoint config ([#22131](https://github.com/microsoft/FluidFramework/issues/22131)) ([e23e509](https://github.com/microsoft/FluidFramework/commit/e23e509d58a6a69be5f8b811a290ff3cea4fc56b)), closes [AB#7875](https://github.com/microsoft/AB/issues/7875)


### Bug Fixes

* **build-tools:** restore support for older git versions ([#22437](https://github.com/microsoft/FluidFramework/issues/22437)) ([1eee5d8](https://github.com/microsoft/FluidFramework/commit/1eee5d854dad73bad01740347e1b54548a54439b)), closes [AB#14894](https://github.com/microsoft/AB/issues/14894)
* **generate:changelog:** Strip additional metadata when loading changesets for changelogs ([#22431](https://github.com/microsoft/FluidFramework/issues/22431)) ([7a1f667](https://github.com/microsoft/FluidFramework/commit/7a1f66746f45fca94c79e74333e53649ea785b47)), closes [AB#14171](https://github.com/microsoft/AB/issues/14171)
* **generate:releaseNotes:** Fix broken TOC links in release notes ([#22464](https://github.com/microsoft/FluidFramework/issues/22464)) ([37bd359](https://github.com/microsoft/FluidFramework/commit/37bd3597965744b174c043e6eec8d74300b80ff9))
* **generate:typetests:** Move type compat exports back to build-tools ([#22443](https://github.com/microsoft/FluidFramework/issues/22443)) ([3303736](https://github.com/microsoft/FluidFramework/commit/33037369892717a717e68dc29f412741283fbdf9)), closes [#22347](https://github.com/microsoft/FluidFramework/issues/22347)

## [0.44.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.43.0...build-tools_v0.44.0) (2024-08-22)


### Bug Fixes

* **build-tools:** Filter out empty responses from git ls-files ([#22247](https://github.com/microsoft/FluidFramework/issues/22247)) ([6f4b15d](https://github.com/microsoft/FluidFramework/commit/6f4b15d5c16b6689af8c1ff2d71cef33b2ada738)), closes [#22226](https://github.com/microsoft/FluidFramework/issues/22226)
* **bump:deps:** Use 'dev' dist-tag instead of 'next' ([#22266](https://github.com/microsoft/FluidFramework/issues/22266)) ([1bc4134](https://github.com/microsoft/FluidFramework/commit/1bc4134643ca7c9bf6a712106824f1211a1b493d))

## [0.43.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.42.0...build-tools_v0.43.0) (2024-08-16)


### Features

* **build-cli:** New command generate:releaseNotes ([#21951](https://github.com/microsoft/FluidFramework/issues/21951)) ([f85a3d2](https://github.com/microsoft/FluidFramework/commit/f85a3d2e1e4f599194cb85c62ab24f029dcd34b7))


### Bug Fixes

* **build-cli:** Fix broken release history command ([#22086](https://github.com/microsoft/FluidFramework/issues/22086)) ([8f6428f](https://github.com/microsoft/FluidFramework/commit/8f6428fff55ab66d11c3e9e41e511eed306d8202))
* **fluid-build:** Fix failures when deleting files ([#22226](https://github.com/microsoft/FluidFramework/issues/22226)) ([610658c](https://github.com/microsoft/FluidFramework/commit/610658c78fe940e1b9485edb12d68c2635818923)), closes [AB#10257](https://github.com/microsoft/AB/issues/10257) [AB#6588](https://github.com/microsoft/AB/issues/6588)

## [0.42.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.41.0...build-tools_v0.42.0) (2024-07-30)


### Bug Fixes

* **fluid-build:** Fix task caching for flub list tasks ([#21989](https://github.com/microsoft/FluidFramework/issues/21989)) ([b42e663](https://github.com/microsoft/FluidFramework/commit/b42e663f3434683cf8ecf00a15ff819398dd7ba9)), closes [AB#9075](https://github.com/microsoft/AB/issues/9075)
* **version-tools:** Correctly identify test version strings ([#22030](https://github.com/microsoft/FluidFramework/issues/22030)) ([5797dc1](https://github.com/microsoft/FluidFramework/commit/5797dc110621b51767549aac34873520d24601e1))

## [0.41.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.40.0...build-tools_v0.41.0) (2024-07-17)


### ⚠ BREAKING CHANGES

* **typetests:** Many typetest changes ([#21876](https://github.com/microsoft/FluidFramework/issues/21876)) ([115c8f4](https://github.com/microsoft/FluidFramework/commit/115c8f4e5c0b9dad79bd3932c417e865784affbc))

## Breaking Changes

Type tests now catch changes to class statics, and broken annotation in
package.json need to have the "Declaration" removed from the names.

### Features

* **build-tools:** include peers in `combinedDependencies` ([#21796](https://github.com/microsoft/FluidFramework/issues/21796)) ([d5f7159](https://github.com/microsoft/FluidFramework/commit/d5f71599cfae2df16493f8e05a1abe0cdbf6fc1a))


### Bug Fixes

* **build-tools:** npm-package-json-scripts-dep alias support ([#21883](https://github.com/microsoft/FluidFramework/issues/21883)) ([33fd5da](https://github.com/microsoft/FluidFramework/commit/33fd5da5b122c7ab81b351c1be388f5934750c95))


* Type test improvements (#21876) ([115c8f4](https://github.com/microsoft/FluidFramework/commit/115c8f4e5c0b9dad79bd3932c417e865784affbc)), closes [#21876](https://github.com/microsoft/FluidFramework/issues/21876)

## [0.40.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.39.0...build-tools_v0.40.0) (2024-07-03)


### Features

* **build-cli:** Add release:prepare command ([#16686](https://github.com/microsoft/FluidFramework/issues/16686)) ([125d1a2](https://github.com/microsoft/FluidFramework/commit/125d1a2d8b5534ab2993e274d4c7c36fe69971d9))
* **check:policy:** Add policy to validate repository.directory field in package.json ([#21605](https://github.com/microsoft/FluidFramework/issues/21605)) ([2b2a2f2](https://github.com/microsoft/FluidFramework/commit/2b2a2f2872ef8fb7a30fcde63daf595c466506ef)), closes [#21689](https://github.com/microsoft/FluidFramework/issues/21689)
* **check:policy:** Policy handler to prevent tab indentation in yml files ([#21626](https://github.com/microsoft/FluidFramework/issues/21626)) ([6e13c15](https://github.com/microsoft/FluidFramework/commit/6e13c15ef853ee9b02e75a80e5f6c6ca8e82bee3))


### Bug Fixes

* **build-cli:** Fix broken filter test ([#21616](https://github.com/microsoft/FluidFramework/issues/21616)) ([d2ba7eb](https://github.com/microsoft/FluidFramework/commit/d2ba7eb2b4175230954f52393240e6667064df98)), closes [#21393](https://github.com/microsoft/FluidFramework/issues/21393)
* **build-cli:** Use release group/package name in all branch names ([#21644](https://github.com/microsoft/FluidFramework/issues/21644)) ([4dd2d49](https://github.com/microsoft/FluidFramework/commit/4dd2d49c53fb1c0c86149860e24ff7404364f3ab))
* **build-tools:** correct tool ref ([#21763](https://github.com/microsoft/FluidFramework/issues/21763)) ([dc16a91](https://github.com/microsoft/FluidFramework/commit/dc16a91cff9d39c46cc25ffc1fe29c26fa02f66b))
* **client:** Correct repository.directory field ([#21689](https://github.com/microsoft/FluidFramework/issues/21689)) ([357d30e](https://github.com/microsoft/FluidFramework/commit/357d30e1f20caa75502528f904b60766e44b73fe)), closes [#21605](https://github.com/microsoft/FluidFramework/issues/21605)
* **fluid-tsc:** Make --build fluid-tsc command not fail with no output ([#21734](https://github.com/microsoft/FluidFramework/issues/21734)) ([8b542d3](https://github.com/microsoft/FluidFramework/commit/8b542d3f5f07731c701a38a0eb43d77ed9120d13))
* Update transitive dependency on socks to address CVE ([#21367](https://github.com/microsoft/FluidFramework/issues/21367)) ([7abbfac](https://github.com/microsoft/FluidFramework/commit/7abbfac4f060e788555d939a0d3520bc75d32b59))
* **version-tools:** Fix comparison of 2.0 releases to RC builds ([#21641](https://github.com/microsoft/FluidFramework/issues/21641)) ([4fb764f](https://github.com/microsoft/FluidFramework/commit/4fb764fc0ea7d84297f7ea74a2a8fb1a5da84457))
* **version-tools:** Fix scheme detection and add more test cases ([#21710](https://github.com/microsoft/FluidFramework/issues/21710)) ([6bc082b](https://github.com/microsoft/FluidFramework/commit/6bc082b755f790c483fc3d1ab1035d54b8cc889f))

## [0.39.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.38.0...build-tools_v0.39.0) (2024-06-06)


### Features

* **build-cli:** Add support for selecting only changed packages ([#18028](https://github.com/microsoft/FluidFramework/issues/18028)) ([42e01d0](https://github.com/microsoft/FluidFramework/commit/42e01d0f9b0f78d0fb8ab337366a9c05b5d054c8))
* **build-tools:** alternate tag export support ([#21276](https://github.com/microsoft/FluidFramework/issues/21276)) ([889153e](https://github.com/microsoft/FluidFramework/commit/889153ed49c5cb55555722a838e6931972030dbc))
* **build-tools:** New command 'publish:tarballs' ([#20934](https://github.com/microsoft/FluidFramework/issues/20934)) ([6fba3ec](https://github.com/microsoft/FluidFramework/commit/6fba3ecb3daf84f986d1f2fcf5ba3128eda948fe))
* **build-tools:** policy for entrypoint linting ([#21240](https://github.com/microsoft/FluidFramework/issues/21240)) ([bf58e43](https://github.com/microsoft/FluidFramework/commit/bf58e4356bfdf462f447f05b65305b2fc61559c2)), closes [AB#8141](https://github.com/microsoft/AB/issues/8141)
* **build-tools:** wildcard 'concurrently' task support ([#21262](https://github.com/microsoft/FluidFramework/issues/21262)) ([b3c1d66](https://github.com/microsoft/FluidFramework/commit/b3c1d66307d16670b7313eb9013f14084ef13964))


### Bug Fixes

* **build-tools:** fluid-build-tasks-eslint deps ([#21089](https://github.com/microsoft/FluidFramework/issues/21089)) ([b85c77e](https://github.com/microsoft/FluidFramework/commit/b85c77e8775cb839d22dd478bddf02513edf9434))
* **build-tools:** gen type tests respecting import order ([#21273](https://github.com/microsoft/FluidFramework/issues/21273)) ([e04b7d8](https://github.com/microsoft/FluidFramework/commit/e04b7d8f0e3c8e6ab123027527b07aeb021e3af0))
* **build-tools:** ignore cross group deps for policy ([#21238](https://github.com/microsoft/FluidFramework/issues/21238)) ([d6ed4c6](https://github.com/microsoft/FluidFramework/commit/d6ed4c6ad5d4f91b204205a3e638a65f4d7ea14c))
* **build-tools:** restore some tsc dep checking ([#20971](https://github.com/microsoft/FluidFramework/issues/20971)) ([05b3ebc](https://github.com/microsoft/FluidFramework/commit/05b3ebc2a20c55f7517291da41fd553b737f01b2))
* **build-tools:** run policy handlers before resolvers ([#21249](https://github.com/microsoft/FluidFramework/issues/21249)) ([d0f4247](https://github.com/microsoft/FluidFramework/commit/d0f4247d17470c04d9d23f2b2491a69a8082c983))
* **build-tools:** type test incremental build ([#20986](https://github.com/microsoft/FluidFramework/issues/20986)) ([1dba9ca](https://github.com/microsoft/FluidFramework/commit/1dba9ca11b36d14e4a330214d098450109eeb9f8))
* **check:policy:** Use `createRequire` and `require` to import CommonJS configs ([#21250](https://github.com/microsoft/FluidFramework/issues/21250)) ([4d3db78](https://github.com/microsoft/FluidFramework/commit/4d3db7812ad76f208b8948e86a1e852f12a5540d)), closes [/github.com/microsoft/FluidFramework/pull/21250/files#r1617995976](https://github.com/microsoft//github.com/microsoft/FluidFramework/pull/21250/files/issues/r1617995976)
* **generate:typetests:** Use types/typings field only for public exports when exports map is not defined ([#20989](https://github.com/microsoft/FluidFramework/issues/20989)) ([087e485](https://github.com/microsoft/FluidFramework/commit/087e4854aa12c2c4245c24a1f5ea793c1c093cb9))

## [0.38.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.37.0...build-tools_v0.38.0) (2024-05-03)


### Features

* **build-cli:** Add generate:packlist command ([#20723](https://github.com/microsoft/FluidFramework/issues/20723)) ([cb2a6f7](https://github.com/microsoft/FluidFramework/commit/cb2a6f73ca49c9464ec9cdf1628b9e33c633bd37))
* **build-cli:** Add generate:typetests command ([#20803](https://github.com/microsoft/FluidFramework/issues/20803)) ([feea9e2](https://github.com/microsoft/FluidFramework/commit/feea9e24c40e6023cde36efa24b22475563e6710)), closes [#18700](https://github.com/microsoft/FluidFramework/issues/18700)
* **build-cli:** Allow commands to select all packages by default ([#16544](https://github.com/microsoft/FluidFramework/issues/16544)) ([c956045](https://github.com/microsoft/FluidFramework/commit/c956045abee8dbe4e4f006f30288daca8770cf83))
* **build-cli:** New command flub modify lockfile ([#20751](https://github.com/microsoft/FluidFramework/issues/20751)) ([b006336](https://github.com/microsoft/FluidFramework/commit/b00633608d75d8e2bd2ee5608ed8d4860e6f2929))
* **build-tools:** `modify fluid-imports` /legacy support ([#20672](https://github.com/microsoft/FluidFramework/issues/20672)) ([aad5ebb](https://github.com/microsoft/FluidFramework/commit/aad5ebbea82dd4dc9823a3d235852c35e23fc151))
* **build-tools:** add --watch support to fluid-tsc ([#20947](https://github.com/microsoft/FluidFramework/issues/20947)) ([95e6050](https://github.com/microsoft/FluidFramework/commit/95e605023303bc53cf8afffa0c1ea5e6645f5f3c))
* **flub:** Add 'Path' to info and --columns filtering ([#20926](https://github.com/microsoft/FluidFramework/issues/20926)) ([096ef79](https://github.com/microsoft/FluidFramework/commit/096ef79d855645fc57c4bb56c21116c51523c47c))


### Bug Fixes

* **build-cli:** Correct filter flag descriptions ([#20826](https://github.com/microsoft/FluidFramework/issues/20826)) ([2bc2276](https://github.com/microsoft/FluidFramework/commit/2bc22767a8fa6cf834da9081f5c4d662be18e836))
* **build-cli:** PackageCommands should error if any of the child processes fail ([#20878](https://github.com/microsoft/FluidFramework/issues/20878)) ([3ad4ee1](https://github.com/microsoft/FluidFramework/commit/3ad4ee12a4a067d5d02f4adc23d02800474726db))
* **build-tools:** Add script to bin/ with shebang for fluid-tsc ([#20714](https://github.com/microsoft/FluidFramework/issues/20714)) ([17570a4](https://github.com/microsoft/FluidFramework/commit/17570a472184e0874abf49437e79810414c7670f))
* **build-tools:** Update broken tests ([#20700](https://github.com/microsoft/FluidFramework/issues/20700)) ([5aea5e7](https://github.com/microsoft/FluidFramework/commit/5aea5e7418771ebbdd0c61dd238b6f4ce8864149))
* **fluid-build:** Always consider semantic errors in incremental tsc ([#20887](https://github.com/microsoft/FluidFramework/issues/20887)) ([95d2b89](https://github.com/microsoft/FluidFramework/commit/95d2b898185b2ad8da2cf742ae335534ec4bdab6))
* **generate:changelog:** Add --(no-)install flag and enhance error reporting ([#20555](https://github.com/microsoft/FluidFramework/issues/20555)) ([46d3823](https://github.com/microsoft/FluidFramework/commit/46d38235e92432c43c46a6d23bd47c9af7b83f2e))
* **generate:entrypoints:** Enable jsx tsconfig option in ts-morph project ([#20780](https://github.com/microsoft/FluidFramework/issues/20780)) ([b56a949](https://github.com/microsoft/FluidFramework/commit/b56a9495cd7804eb3b75525146c9f797a544d35e))
* **generate:typetests:** Exit earlier when typetests are disabled ([#20877](https://github.com/microsoft/FluidFramework/issues/20877)) ([7eb8209](https://github.com/microsoft/FluidFramework/commit/7eb820932e656e4bb58ab9c64d07503457864438)), closes [#20878](https://github.com/microsoft/FluidFramework/issues/20878)
* **generate:typetests:** Load source instead of type declarations for current package version ([#20885](https://github.com/microsoft/FluidFramework/issues/20885)) ([d76ba0c](https://github.com/microsoft/FluidFramework/commit/d76ba0c015e61cc00cad26e39a72f5a999c62f56))
* **modify:fluid-imports:** Use narrower checks for whether an import is a Fluid import ([#20730](https://github.com/microsoft/FluidFramework/issues/20730)) ([8ab7082](https://github.com/microsoft/FluidFramework/commit/8ab70823bde6fa48f8a7180fcad910b0926cd9f5))

## [0.37.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.36.0...build-tools_v0.37.0) (2024-04-12)


### Features

* **build-tools:** `generate entrypoints` per package.json with Node10 option ([#20631](https://github.com/microsoft/FluidFramework/issues/20631)) ([521dbd1](https://github.com/microsoft/FluidFramework/commit/521dbd12591e10a737999a7c4ec83791ff3277bc))


### Bug Fixes

* **build-tools:** generate entrypoints overloaded API ([#20630](https://github.com/microsoft/FluidFramework/issues/20630)) ([a772fbf](https://github.com/microsoft/FluidFramework/commit/a772fbfb8df90172548b19181584df36270c0c5b))

## [0.36.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.35.0...build-tools_v0.36.0) (2024-04-10)


### Features

* **generate:entrypoints:** Support output filename customization ([#20593](https://github.com/microsoft/FluidFramework/issues/20593)) ([4e94094](https://github.com/microsoft/FluidFramework/commit/4e94094abc280ceda11a0833c9c109e1c353e91e))

## [0.35.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.34.0...build-tools_v0.35.0) (2024-04-09)


### Features

* **build-cli:** Add `modify fluid-imports` command ([#20006](https://github.com/microsoft/FluidFramework/issues/20006)) ([afe35a4](https://github.com/microsoft/FluidFramework/commit/afe35a41fb3998d9df1526ca573840b88e005be2))
* **build-tools:** `fluid-imports` to read API levels from packages ([#20437](https://github.com/microsoft/FluidFramework/issues/20437)) ([56af782](https://github.com/microsoft/FluidFramework/commit/56af782101fac6b501975a862244cc4140302a99))
* **build-tools:** New command `generate:entrypoints` ([#20477](https://github.com/microsoft/FluidFramework/issues/20477)) ([e84fbf4](https://github.com/microsoft/FluidFramework/commit/e84fbf49ae781ffce54ac0725a27ff8eb0d6bcf8))
* **build-tools:** single ts project use ([#20187](https://github.com/microsoft/FluidFramework/issues/20187)) ([2830317](https://github.com/microsoft/FluidFramework/commit/283031722f4e3cc719b5e72577b8eb90eaae70e5))
* **fluid-build:** Add incremental build support for biome tasks ([#20173](https://github.com/microsoft/FluidFramework/issues/20173)) ([b99f0e0](https://github.com/microsoft/FluidFramework/commit/b99f0e02e0814970c73cc31401994588bc3989e1))


### Bug Fixes

* **build-tools,client:** api-extractor cleanup and incrementality ([#20394](https://github.com/microsoft/FluidFramework/issues/20394)) ([a6b5f7c](https://github.com/microsoft/FluidFramework/commit/a6b5f7c2cd24e6b4c86be8b62f448ecedf780687))
* **build-tools:** `modify fluid-imports` ([#20397](https://github.com/microsoft/FluidFramework/issues/20397)) ([a78dc6c](https://github.com/microsoft/FluidFramework/commit/a78dc6c6dd9843009c6f33dfd0b9620fe0093814))
* **build-tools:** handle special export cases ([#20512](https://github.com/microsoft/FluidFramework/issues/20512)) ([9166910](https://github.com/microsoft/FluidFramework/commit/91669108ccf45512580d6a8f6080798554a14c84))
* **build-tools:** mixed internal range detection ([#18828](https://github.com/microsoft/FluidFramework/issues/18828)) ([6ecc27e](https://github.com/microsoft/FluidFramework/commit/6ecc27ee08b8d84bc6a8bc32a87ba2f10fda4bb3))
* **build-tools:** relax fluid-build-tasks-eslint for lint only projects ([#20432](https://github.com/microsoft/FluidFramework/issues/20432)) ([8626477](https://github.com/microsoft/FluidFramework/commit/8626477401160e646cf686e7566cdbd85e79e96d)), closes [AB#7630](https://github.com/microsoft/AB/issues/7630)
* **build-tools:** tsc task policy Windows ([#20172](https://github.com/microsoft/FluidFramework/issues/20172)) ([ae890d3](https://github.com/microsoft/FluidFramework/commit/ae890d3243ebff9836474e0c6a61c386404e3630)), closes [AB#7460](https://github.com/microsoft/AB/issues/7460)
* **flub release:** Account for RC release branch names ([#20229](https://github.com/microsoft/FluidFramework/issues/20229)) ([f0ba3ef](https://github.com/microsoft/FluidFramework/commit/f0ba3ef41c4fe8f4d98e57376c68d0335f9f2a17))
* **fluid-build:** limit Biome config tracking to repo ([#20296](https://github.com/microsoft/FluidFramework/issues/20296)) ([5c7a249](https://github.com/microsoft/FluidFramework/commit/5c7a2492fc05aa10b3a145f0dea831333796d52e))
* **fluid-build:** TscTask does not detect incremental changes in some projects ([#20032](https://github.com/microsoft/FluidFramework/issues/20032)) ([6c6a811](https://github.com/microsoft/FluidFramework/commit/6c6a811215491ea69481bc4c03bb9f90000f9b94))
* **fluid-build:** TscTask use the correct noEmit flag to check for previous errors ([#20040](https://github.com/microsoft/FluidFramework/issues/20040)) ([4909d82](https://github.com/microsoft/FluidFramework/commit/4909d8206bfd74386b5b16902f8ccbc4ebd376cf))
* **generate:upcoming:** Include all changesets when release type is major ([#20552](https://github.com/microsoft/FluidFramework/issues/20552)) ([92b38b1](https://github.com/microsoft/FluidFramework/commit/92b38b1d878e26c0c6f430cb70e520ec503c34b3))
* **generate:upcoming:** Use release group-relative paths ([#20015](https://github.com/microsoft/FluidFramework/issues/20015)) ([3a3311f](https://github.com/microsoft/FluidFramework/commit/3a3311fe2ebc9adf276468bc4c8de49631aee750))

## [0.34.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.33.0...build-tools_v0.34.0) (2024-02-20)


### Features

* **build-tools:** `fluid-tsc` ([#19698](https://github.com/microsoft/FluidFramework/issues/19698)) ([b9a2751](https://github.com/microsoft/FluidFramework/commit/b9a275124523cf65c6546d775207fa36d477964a))

## [0.33.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.32.0...build-tools_v0.33.0) (2024-02-15)


### Bug Fixes

* **ci:** Bring bundle-size-comparison back online ([#19638](https://github.com/microsoft/FluidFramework/issues/19638)) ([337fcd2](https://github.com/microsoft/FluidFramework/commit/337fcd24215be1d5b91a4e2ee3636994377c7292))

## [0.32.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.30.0...build-tools_v0.32.0) (2024-02-14)


### Bug Fixes

* **docs:** Wildcard redirects brute force fix ([#19547](https://github.com/microsoft/FluidFramework/issues/19547)) ([79dd64d](https://github.com/microsoft/FluidFramework/commit/79dd64d22a155b17e7d17f678c4d603e402c8e48))

## 0.31.0

Not released.

## [0.30.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.30.0...build-tools_v0.30.0) (2024-02-08)


### Features

* **build-tools:** Add policy handler to ensure public packages have required api-extractor scripts and dependency ([#18804](https://github.com/microsoft/FluidFramework/issues/18804)) ([0e93d05](https://github.com/microsoft/FluidFramework/commit/0e93d0519be41c79cc987793e5c93972c0e7682b))
* **check:policy:** Prevent .js file extension ([#19106](https://github.com/microsoft/FluidFramework/issues/19106)) ([0f2b8da](https://github.com/microsoft/FluidFramework/commit/0f2b8dab89150b5a93905eaf875413d512408b7f))


### Bug Fixes

* **version-tools:** Detect bump types between RC builds and internal builds correctly ([#19152](https://github.com/microsoft/FluidFramework/issues/19152)) ([aaa4441](https://github.com/microsoft/FluidFramework/commit/aaa444166d86988afb6878949eadfbfa8269f7b5))

## [0.29.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.28.0...build-tools_v0.29.0) (2024-01-04)


### Features

* **fluid-build:** Task caching for ts2esm tasks ([#19027](https://github.com/microsoft/FluidFramework/issues/19027)) ([ac5840d](https://github.com/microsoft/FluidFramework/commit/ac5840dbead2f7ab5756b45a873aa60ffb08d319))
* **generate:buildVersion:** Add support for RC versions ([#18373](https://github.com/microsoft/FluidFramework/issues/18373)) ([f127d00](https://github.com/microsoft/FluidFramework/commit/f127d0019d7c1d8e7ca2195c77d2610663dcaaa3)), closes [AB#6142](https://github.com/microsoft/AB/issues/6142)


### Bug Fixes

* **check:policy:** Exclude scripts that use tsc --watch from "check phase", not just "resolve phase" ([#18529](https://github.com/microsoft/FluidFramework/issues/18529)) ([e89a478](https://github.com/microsoft/FluidFramework/commit/e89a478169f1500c6d4cb156451257a043346c11))
* **fluid-build:** Fix caching of tsc-multi tasks ([#18957](https://github.com/microsoft/FluidFramework/issues/18957)) ([1196b7a](https://github.com/microsoft/FluidFramework/commit/1196b7a001238549777dfcbf091c0e6d56777a8b))
* **fluid-build:** incremental ts2esm task ([#19062](https://github.com/microsoft/FluidFramework/issues/19062)) ([49b17c3](https://github.com/microsoft/FluidFramework/commit/49b17c379d04d90650c3c97ca3b9be297a6efbeb))
* More dual-emit support (mostly for test coverage) ([#18866](https://github.com/microsoft/FluidFramework/issues/18866)) ([938b108](https://github.com/microsoft/FluidFramework/commit/938b1083c415ba16ef5d2d28058570b098f364e7))

## [0.28.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.27.0...build-tools_v0.28.0) (2023-11-16)


### Features

* **type-tests:** explicitly return void in type-test function ([#18282](https://github.com/microsoft/FluidFramework/issues/18282)) ([b1165d8](https://github.com/microsoft/FluidFramework/commit/b1165d8e294b6a5303b4da84b9498c945cf85bef))


### Bug Fixes

* **fluid-build:** Ignore --cache flag in prettier ([#18341](https://github.com/microsoft/FluidFramework/issues/18341)) ([c9da0db](https://github.com/microsoft/FluidFramework/commit/c9da0dbde0d95889f88cb0eb6dea9d86ef1dd829))
* **fluid-build:** Include source files in tsc-multi done file ([#18292](https://github.com/microsoft/FluidFramework/issues/18292)) ([fdd0941](https://github.com/microsoft/FluidFramework/commit/fdd09413bb8ed288cf7a4a1667f573d97244a7c5))
* **release:fromTag:** Return correct release dates ([#18254](https://github.com/microsoft/FluidFramework/issues/18254)) ([cd717b1](https://github.com/microsoft/FluidFramework/commit/cd717b1a6829ad6d0ecda9d478886a71edf264f9))

## [0.27.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.26.0...build-tools_v0.27.0) (2023-11-10)


### Features

* **build-tools:** Add support for tsc-multi ([#18233](https://github.com/microsoft/FluidFramework/issues/18233)) ([8969798](https://github.com/microsoft/FluidFramework/commit/8969798c7dc1064f1824132e11843ab5f90e9935))
* **check:policy:** Make policy handlers async ([#17931](https://github.com/microsoft/FluidFramework/issues/17931)) ([6a6da06](https://github.com/microsoft/FluidFramework/commit/6a6da064567454237f6dafc60eee8c4205be28b0))


### Bug Fixes

* **build-cli:** Fix broken test ([#18105](https://github.com/microsoft/FluidFramework/issues/18105)) ([16ddcf5](https://github.com/microsoft/FluidFramework/commit/16ddcf5e4ac950207d0e3608414bdaf2c290d312))
* **build-tools:** Use fluid-build task definitions ([#18159](https://github.com/microsoft/FluidFramework/issues/18159)) ([9793744](https://github.com/microsoft/FluidFramework/commit/97937447bc82d5b492b5b180ac74669d4c26ca86))
* **check:policy:** consistent script arguments ([#18057](https://github.com/microsoft/FluidFramework/issues/18057)) ([8b3da9d](https://github.com/microsoft/FluidFramework/commit/8b3da9d8626a72826a826eddbf09afef9943911e))
* **check:policy:** Exclude tsc --watch tasks from policy ([#18104](https://github.com/microsoft/FluidFramework/issues/18104)) ([6aae2ce](https://github.com/microsoft/FluidFramework/commit/6aae2ce76e6679fa6ecc94161ab6d5bae698a2dc))
* **check:policy:** Include the handler name in failure message ([#18102](https://github.com/microsoft/FluidFramework/issues/18102)) ([6a2bda9](https://github.com/microsoft/FluidFramework/commit/6a2bda96c981f8f1d09a58975441db9758fd33b6))

## [0.26.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.25.0...build-tools_v0.26.0) (2023-10-25)


### Features

* **build-cli:** Add generate:assertTags command ([#17872](https://github.com/microsoft/FluidFramework/issues/17872)) ([826f779](https://github.com/microsoft/FluidFramework/commit/826f7797043b1d70f80e122f0c1f8aeeb37e300e))
* **check:policy:** Verify all packages have a types field in package.json ([#17807](https://github.com/microsoft/FluidFramework/issues/17807)) ([8e277f8](https://github.com/microsoft/FluidFramework/commit/8e277f849fdf484f2dbf28dc32c4dff6c40b2ce9))
* **check:policy:** Verify packages have an exports field in package.json ([#17824](https://github.com/microsoft/FluidFramework/issues/17824)) ([5b580d3](https://github.com/microsoft/FluidFramework/commit/5b580d3b5b86e3070f4c18900fd688bb3219baa6))
* **fluid-build:** Release group root script support ([#17835](https://github.com/microsoft/FluidFramework/issues/17835)) ([90c7f9d](https://github.com/microsoft/FluidFramework/commit/90c7f9d61f0e0e35e59b884509fd15791d88b03f)), closes [#17837](https://github.com/microsoft/FluidFramework/issues/17837)


### Bug Fixes

* **build-tools:** run.js should set development: false ([#17893](https://github.com/microsoft/FluidFramework/issues/17893)) ([dcea05a](https://github.com/microsoft/FluidFramework/commit/dcea05a8fafe766b68e81ae6a398ebba659c56ac))
* **build-tools:** Windows compatible clean policy ([#17874](https://github.com/microsoft/FluidFramework/issues/17874)) ([a1fb4e8](https://github.com/microsoft/FluidFramework/commit/a1fb4e869b575a5f991ff3edb51f62938c3f5154))
* **check:policy:** Add changes that were missed to the exports field policy ([#17886](https://github.com/microsoft/FluidFramework/issues/17886)) ([cbef814](https://github.com/microsoft/FluidFramework/commit/cbef814a836a837621dc31fb657fc6c725aae3e6)), closes [#17824](https://github.com/microsoft/FluidFramework/issues/17824)
* **check:policy:** Use exports.default for CJS- and ESM-only packages ([#17894](https://github.com/microsoft/FluidFramework/issues/17894)) ([30def22](https://github.com/microsoft/FluidFramework/commit/30def221eb3428342d301d8135dbfb7cfb53b3ce))
* **fluid-build:** Clean up eslint warnings in `build-tools` package ([#17718](https://github.com/microsoft/FluidFramework/issues/17718)) ([ec80944](https://github.com/microsoft/FluidFramework/commit/ec809441c0f61affe62db430f00a6ddbb6123be4))

## [0.25.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.24.0...build-tools_v0.25.0) (2023-10-04)

No recorded changes.

## [0.24.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.23.0...build-tools_v0.24.0) (2023-09-25)


### Bug Fixes

* **build-cli:** Fetch only from upstream remote ([#17393](https://github.com/microsoft/FluidFramework/issues/17393)) ([de06e2e](https://github.com/microsoft/FluidFramework/commit/de06e2e368230316c59fab3ffc53ed767404fb7f))
* **bump:deps:** Fix filtering of release groups ([#17055](https://github.com/microsoft/FluidFramework/issues/17055)) ([7829d8a](https://github.com/microsoft/FluidFramework/commit/7829d8a50770989482c5669a6e54352ef657f35b))
* **fluid-build:** Pass env vars to child processes ([#17440](https://github.com/microsoft/FluidFramework/issues/17440)) ([93f8f89](https://github.com/microsoft/FluidFramework/commit/93f8f89acfc1f9e9185251b08096cf9d6937297f))

## [0.23.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.22.0...build-tools_v0.23.0) (2023-08-28)


### Features

* **bump:deps:** Add experimental homegrown update checker ([#16356](https://github.com/microsoft/FluidFramework/issues/16356)) ([45fc83f](https://github.com/microsoft/FluidFramework/commit/45fc83f8aef0134a2897f56643582c254414c195))
* **check:policy:** Add configurable policy for package names and scopes ([#16863](https://github.com/microsoft/FluidFramework/issues/16863)) ([649d19d](https://github.com/microsoft/FluidFramework/commit/649d19dc35b786b64e04334d932f4a8832a6ec02))


### Bug Fixes

* **bump:deps:** Add undefined check ([#16937](https://github.com/microsoft/FluidFramework/issues/16937)) ([0e43733](https://github.com/microsoft/FluidFramework/commit/0e4373362dd9f497820c5fe234901f33ec956da2))
* **bump:deps:** Exclude private packages when checking npm ([#16683](https://github.com/microsoft/FluidFramework/issues/16683)) ([a04331f](https://github.com/microsoft/FluidFramework/commit/a04331f65c2c483faa3c480f27c6f959bc119151))
* **fluid-build:** fix incremental builds for TS 5.1 ([#16985](https://github.com/microsoft/FluidFramework/issues/16985)) ([f4e37b2](https://github.com/microsoft/FluidFramework/commit/f4e37b203f510479a2a6288cc4e345ca415518ab))
* **typetests:** Don't fail when packages have no dependencies ([#16717](https://github.com/microsoft/FluidFramework/issues/16717)) ([65adbc2](https://github.com/microsoft/FluidFramework/commit/65adbc27e2afd5b26f72f7b25feaa262c49852d7))

## [0.22.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.21.0...build-tools_v0.22.0) (2023-08-02)


### Bug Fixes

* **build-tools:** Support unscoped package names ([#16543](https://github.com/microsoft/FluidFramework/issues/16543)) ([675cc1e](https://github.com/microsoft/FluidFramework/commit/675cc1e9622bd44e813c84524c65b27eebf3e3dd))
* **bundle-size-tools:** Report size 0 instead of failing for missing asset ([#16564](https://github.com/microsoft/FluidFramework/issues/16564)) ([507dc26](https://github.com/microsoft/FluidFramework/commit/507dc26111df013c40d0710b9dfed9b46f1fb97b))
* **bundle-size:** Fix NaNs in bundle size comparison ([#16605](https://github.com/microsoft/FluidFramework/issues/16605)) ([2395a24](https://github.com/microsoft/FluidFramework/commit/2395a244ecdf59ca0f1be522c9ae7079c7d8aa01))
* **fluid-build:** Load server root path from settings ([#16666](https://github.com/microsoft/FluidFramework/issues/16666)) ([d9ba203](https://github.com/microsoft/FluidFramework/commit/d9ba203e796caee95b4a56fff4b9712e2c4be58b))
* **merge:branches:** Merge source into target branch instead of the other way ([#16496](https://github.com/microsoft/FluidFramework/issues/16496)) ([e45e495](https://github.com/microsoft/FluidFramework/commit/e45e4951cd28d8af0ff14f3d279287c2c479ba93))
* **merge:branches:** Switch branches before trying to delete the branch ([#16398](https://github.com/microsoft/FluidFramework/issues/16398)) ([e51ba16](https://github.com/microsoft/FluidFramework/commit/e51ba16a5bc58a7023ecc6ed0a93923f645808ab))
* **merge:branches:** Update merge instructions ([#16500](https://github.com/microsoft/FluidFramework/issues/16500)) ([75e95b4](https://github.com/microsoft/FluidFramework/commit/75e95b4a2add7c8cd1be015bd49d07238eaa42fe))

## [0.21.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.20.0...build-tools_v0.21.0) (2023-07-11)

### ⚠ BREAKING CHANGES

* **build-tools:** - `flub generate packageJson` has been removed since it is no longer
needed in the pipeline.
- `getIsLatest` and `getSimpleVersion` have moved to the version-tools
package.
- The following exports are removed from build-tools:
	- `getVersionsFromStrings`
	- `bumpDependencies`
	- `bumpRepo`
	- `cleanPrereleaseDependencies`
	- `createReleaseBump`
	- `releaseVersion`
	- `generateMonoRepoInstallPackageJson`
	- `exec`
	- `execNoError`
	- `execAsync`
	- `execWithErrorAsync`
	- `readFileAsync`
	- `writeFileAsync`
- The following bin scripts have been removed from build-tools:
	- fluid-build-version
	- fluid-bump-version
	- fluid-collect-bundle-analyses
	- fluid-layer-check
	- fluid-repo-policy-check
	- fluid-run-bundle-analyses
- ~~The collectVersionInfo and collectBumpInfo methods were removed from
the Context class.~~ Deprecated instead.

### Bug Fixes

* **bump:deps:** Allow bumping server deps ([#16313](https://github.com/microsoft/FluidFramework/issues/16313)) ([4098adf](https://github.com/microsoft/FluidFramework/commit/4098adf3ef56e3a09e37a7d9292c005f08318080))
* Correct handling of filter and selectionFlags ([#16254](https://github.com/microsoft/FluidFramework/issues/16254)) ([a8fbb2e](https://github.com/microsoft/FluidFramework/commit/a8fbb2e8765afaaccf2a2ff93cd7c99a9fc2c688))


### Code Refactoring

* **build-tools:** Delete unused code and exports ([#15079](https://github.com/microsoft/FluidFramework/issues/15079)) ([281ee8d](https://github.com/microsoft/FluidFramework/commit/281ee8d3bbff74ca3af3136812fdaa2c2ae834af))

## [0.20.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.19.0...build-tools_v0.20.0) (2023-06-30)


### Features

* **build-tools:** Add "list" command to replace "lerna ls" ([#16114](https://github.com/microsoft/FluidFramework/issues/16114)) ([3cb7cef](https://github.com/microsoft/FluidFramework/commit/3cb7cef88dcfc6b8bb02f13eb9618b00f3d4859e))
* **build-tools:** Add generate changelog command ([#15949](https://github.com/microsoft/FluidFramework/issues/15949)) ([12a5ec6](https://github.com/microsoft/FluidFramework/commit/12a5ec68b03b38b5ff0456e26ca1df5235b72f3e)), closes [AB#3975](https://github.com/microsoft/AB/issues/3975)
* **changesets:** Prompt to select target branch ([#16141](https://github.com/microsoft/FluidFramework/issues/16141)) ([8f55673](https://github.com/microsoft/FluidFramework/commit/8f5567332c67f69a121f28f2b34ee75c9318d6d3))


### Bug Fixes

* **bundleStats:** Correctly handle pnpm list output ([#16168](https://github.com/microsoft/FluidFramework/issues/16168)) ([c21253c](https://github.com/microsoft/FluidFramework/commit/c21253c4276e6c3757d4a85885fa4ea1004f1a49))
* **changesets:** Handle uncommitted changesets ([#16126](https://github.com/microsoft/FluidFramework/issues/16126)) ([f442bfe](https://github.com/microsoft/FluidFramework/commit/f442bfe7804a38b86032f04a0ce7741915c2bd92))
* **changesets:** Sort changed packages earlier ([#16133](https://github.com/microsoft/FluidFramework/issues/16133)) ([6464d0c](https://github.com/microsoft/FluidFramework/commit/6464d0ce2de75a3f12d524c0e5e9a4a81964e98b))
* **fluid-build:** Avoid typetests:gen dependency for tsc script on project that has sep… ([#16135](https://github.com/microsoft/FluidFramework/issues/16135)) ([50afbdf](https://github.com/microsoft/FluidFramework/commit/50afbdfaa804e6b4505cb0587ae2b1b128f07ef6))
* **fluid-build:** Don't run script tasks not in task definition ([#16100](https://github.com/microsoft/FluidFramework/issues/16100)) ([c8d196e](https://github.com/microsoft/FluidFramework/commit/c8d196ef86fe0d7ee7d411682bbfb5a2564daef3))
* **generate:changeset:** getChangedSinceRef and related functions use remote properly ([#16067](https://github.com/microsoft/FluidFramework/issues/16067)) ([9950467](https://github.com/microsoft/FluidFramework/commit/99504672fed8d70017aaa1d18527c7080a2d0954))
* **release:** Run install when prerelease dependencies are updated ([#16037](https://github.com/microsoft/FluidFramework/issues/16037)) ([0c2045c](https://github.com/microsoft/FluidFramework/commit/0c2045c089f65ea0ddf2468691bad191cb9351d4))
* **upcoming:** Don't output the changeset dates ([#16204](https://github.com/microsoft/FluidFramework/issues/16204)) ([ccb3450](https://github.com/microsoft/FluidFramework/commit/ccb3450d2168d62332d6055f426e5b9033ae9eec))

## [0.19.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.18.0...build-tools_v0.19.0) (2023-06-16)


### Bug Fixes

* **build-tools:** Don't include dynamic version in readmes ([#16028](https://github.com/microsoft/FluidFramework/issues/16028)) ([1fd70e0](https://github.com/microsoft/FluidFramework/commit/1fd70e0566d33840d87ab0a46bd860e4e25ed8d7))
* **build-tools:** Fix dependency and task prioritization ([#15835](https://github.com/microsoft/FluidFramework/issues/15835)) ([4eb9a49](https://github.com/microsoft/FluidFramework/commit/4eb9a49cf45fb9fecd6ac3545b55d9e7a2a14dc4))
* Fixes for build-tools for LTS branch ([#15912](https://github.com/microsoft/FluidFramework/issues/15912)) ([8703507](https://github.com/microsoft/FluidFramework/commit/8703507091bee789aa7908a10b906ba5f6f04bab))
* **generate:changeset:** Support entering changeset info in CLI ([#15876](https://github.com/microsoft/FluidFramework/issues/15876)) ([2e376e5](https://github.com/microsoft/FluidFramework/commit/2e376e520a84f93bb24e598d8742955f4e919fa5))
* Pin version for npx lerna in build-tools ([#15923](https://github.com/microsoft/FluidFramework/issues/15923)) ([6ac4182](https://github.com/microsoft/FluidFramework/commit/6ac418261bf63a9c2e857fbdb73cc9f8b0ab46ff))
* **release:** Handle independent packages with release branches ([#15847](https://github.com/microsoft/FluidFramework/issues/15847)) ([68448c9](https://github.com/microsoft/FluidFramework/commit/68448c9e8522e76d4c71c6672256601a641ea82b))

## [0.18.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.17.0...build-tools_v0.18.0) (2023-06-01)


### ⚠ BREAKING CHANGES

* **fluid-build:** The `--script` flag has been removed. Use the `--task`
flag instead.

### Features

* Add `changeset add` command ([#15489](https://github.com/microsoft/FluidFramework/issues/15489)) ([be64285](https://github.com/microsoft/FluidFramework/commit/be642852a878c3dfd9212808dea91722f6908160)), closes [AB#3967](https://github.com/microsoft/AB/issues/3967)
* Implement declarative task dependencies in `fluid-build` ([#15589](https://github.com/microsoft/FluidFramework/issues/15589)) ([af627a4](https://github.com/microsoft/FluidFramework/commit/af627a48fab9cea7bb7f14ce4a4886882499df78))


### Bug Fixes

* Better error message and fix couple of task definitions ([#15609](https://github.com/microsoft/FluidFramework/issues/15609)) ([95ea724](https://github.com/microsoft/FluidFramework/commit/95ea724d4781bbc1d3fcdff4b6dfe589ac1df8b2))
* fluid-build select precise dependencies ([#15621](https://github.com/microsoft/FluidFramework/issues/15621)) ([1020163](https://github.com/microsoft/FluidFramework/commit/1020163e912ef33d34975e63c7df41fc75d837bb))

## [0.17.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.16.0...build-tools_v0.17.0) (2023-05-05)


### Features

* Support JSON output in check:changeset ([#15465](https://github.com/microsoft/FluidFramework/issues/15465)) ([cb98c6e](https://github.com/microsoft/FluidFramework/commit/cb98c6e66c03fca6a1b3ce09b7479d7f9ac399a8)), closes [#15472](https://github.com/microsoft/FluidFramework/issues/15472)


### Bug Fixes

* **fluid-build:** Handle all workspace ranges when checking symlinks ([#15469](https://github.com/microsoft/FluidFramework/issues/15469)) ([0e1e41f](https://github.com/microsoft/FluidFramework/commit/0e1e41ff4064790819a25100c42621d0b09af272))
* **report:** Handle workspace ranges when generating reports ([#15439](https://github.com/microsoft/FluidFramework/issues/15439)) ([e4b473e](https://github.com/microsoft/FluidFramework/commit/e4b473eaf09ec8b9318199b1ec8991dacadc5462))

## [0.16.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.15.0...build-tools_v0.16.0) (2023-05-03)

### ⚠ BREAKING CHANGES

* **bump:** The `--exactDepType` flag in the `bump` command no
longer has a default value. It has also been deprecated. It has been
replaced by the `--interdependencyType` flag. The deprecated flag will
be removed in an upcoming release.

### Features

* Add check buildVersion command ([#15392](https://github.com/microsoft/FluidFramework/issues/15392)) ([65ed736](https://github.com/microsoft/FluidFramework/commit/65ed7363510bdb8bc1009be345484b196fa0f61d)), closes [/github.com/microsoft/FluidFramework/pull/15381#issuecomment-1530727486](https://github.com/microsoft//github.com/microsoft/FluidFramework/pull/15381/issues/issuecomment-1530727486)
* Add check changeset command ([#15320](https://github.com/microsoft/FluidFramework/issues/15320)) ([3820ffb](https://github.com/microsoft/FluidFramework/commit/3820ffb72fb8f1a839f5fd35d88dae0748b25ac9))
* Add release fromTag command ([#15287](https://github.com/microsoft/FluidFramework/issues/15287)) ([116ece1](https://github.com/microsoft/FluidFramework/commit/116ece1e0dc2108990aa1eeeec9be21c1270b508)), closes [#15288](https://github.com/microsoft/FluidFramework/issues/15288)
* **bump:** Look up packages by unscoped name ([#15107](https://github.com/microsoft/FluidFramework/issues/15107)) ([31d8b31](https://github.com/microsoft/FluidFramework/commit/31d8b31a95a85c68376bd74d709bd5ba53518174))
* **bump:** Support workspace protocol in release and bump tools ([#15053](https://github.com/microsoft/FluidFramework/issues/15053)) ([a8c6178](https://github.com/microsoft/FluidFramework/commit/a8c617819781413a1d3154c344450f8ec7a41400)), closes [#15158](https://github.com/microsoft/FluidFramework/issues/15158) [AB#3422](https://github.com/microsoft/AB/issues/3422)
* **info:** Add JSON output support ([#14778](https://github.com/microsoft/FluidFramework/issues/14778)) ([6a4d9b8](https://github.com/microsoft/FluidFramework/commit/6a4d9b8714acd33bb7b66d4c02c4596c0865a326))


### Bug Fixes

* **build-tools:** Remove readme from plugins list ([#15435](https://github.com/microsoft/FluidFramework/issues/15435)) ([5c69b84](https://github.com/microsoft/FluidFramework/commit/5c69b841d62638eea2b6957f69e5304e40167fe0))
* **bump:** Fix interdependency range handling ([#15432](https://github.com/microsoft/FluidFramework/issues/15432)) ([ffb4578](https://github.com/microsoft/FluidFramework/commit/ffb45781dcb53d742e7b85e19031e80ca8ccd63c))
* **release:** Correctly apply workspace interdependencyRanges ([#15420](https://github.com/microsoft/FluidFramework/issues/15420)) ([3543630](https://github.com/microsoft/FluidFramework/commit/3543630d20c3294876d7b78c467c6a3fc725d09a))
* **release:** Exception when running policy-check tasks ([#15414](https://github.com/microsoft/FluidFramework/issues/15414)) ([0cf7b05](https://github.com/microsoft/FluidFramework/commit/0cf7b051d0e48886ac95f51f65dc390b849d70e3))

## [0.15.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.14.0...build-tools_v0.15.0) (2023-04-20)

### Bug Fixes

* **release:** Independent packages should use release branches ([#15199](https://github.com/microsoft/FluidFramework/issues/15199)) ([c985f84](https://github.com/microsoft/FluidFramework/commit/c985f8434ea36528e53132b41ed93252afddf22e))

## [0.14.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.13.0...build-tools_v0.14.0) (2023-04-18)


### ⚠ BREAKING CHANGES

* Some exports have been removed, changing the API
surface.

### Features

* **build-cli:** Add exec command ([#14635](https://github.com/microsoft/FluidFramework/issues/14635)) ([5898496](https://github.com/microsoft/FluidFramework/commit/5898496b743a58357bbaa0011d5754c3cce1758c))
* **check:policy:** Add setting to ignore single-package pnpm workspaces ([#14656](https://github.com/microsoft/FluidFramework/issues/14656)) ([ad72865](https://github.com/microsoft/FluidFramework/commit/ad72865d909fc7e5bdc7fb89b4d87fd8938a3fe5))


### Bug Fixes

* **build-cli:** Use shell in exec and bump ([#15117](https://github.com/microsoft/FluidFramework/issues/15117)) ([c6c34d4](https://github.com/microsoft/FluidFramework/commit/c6c34d44138c302c66dc77e327c9e4bdfa91abbf)), closes [AB#4067](https://github.com/microsoft/AB/issues/4067)
* **bump:** Correctly apply exactDepType when bumping ([#14999](https://github.com/microsoft/FluidFramework/issues/14999)) ([61dc925](https://github.com/microsoft/FluidFramework/commit/61dc92504bab0dbff900413cf07b336cf19de248)), closes [AB#2415](https://github.com/microsoft/AB/issues/2415) [#15053](https://github.com/microsoft/FluidFramework/issues/15053)
* **bump:** Correctly save package.json of bumped packages ([#14727](https://github.com/microsoft/FluidFramework/issues/14727)) ([534da6b](https://github.com/microsoft/FluidFramework/commit/534da6b76d808a71370ae4dd0f97b86880a3270d)), closes [#14481](https://github.com/microsoft/FluidFramework/issues/14481)
* **bump:** Fix incorrect paths when bumping release groups ([#15135](https://github.com/microsoft/FluidFramework/issues/15135)) ([4ca9f95](https://github.com/microsoft/FluidFramework/commit/4ca9f95cf0023f9ed69ab3d4d135914ea216d0d4))
* **bump:** Fix invalid flag configuration ([#14475](https://github.com/microsoft/FluidFramework/issues/14475)) ([e8d0193](https://github.com/microsoft/FluidFramework/commit/e8d0193536a12c5890bdea6ab719e1effa3a9b65))
* **bump:** Pass allow-same-version to npm version ([#15149](https://github.com/microsoft/FluidFramework/issues/15149)) ([58942b4](https://github.com/microsoft/FluidFramework/commit/58942b4179c712ac3a901a71108e35cbe4bf6ac0))
* **policy-check:** Use correct package.json indentation ([#14481](https://github.com/microsoft/FluidFramework/issues/14481)) ([2ec5912](https://github.com/microsoft/FluidFramework/commit/2ec5912d0d2feac4237aa2418a60cb740ab9121a))
* **release:** checkOnReleaseBranch handler ignores CLI argument ([#14872](https://github.com/microsoft/FluidFramework/issues/14872)) ([3f056f0](https://github.com/microsoft/FluidFramework/commit/3f056f02fcb2657049f9310a1c567bd2b5d037a0))
* **release:** Handle released dependency bumps ([#14669](https://github.com/microsoft/FluidFramework/issues/14669)) ([d33bee7](https://github.com/microsoft/FluidFramework/commit/d33bee7c6510775a84fd268662362ae22a423e8c))
* **telemetry-generator:** back to npm from pnpm ([#14695](https://github.com/microsoft/FluidFramework/issues/14695)) ([3fcfdca](https://github.com/microsoft/FluidFramework/commit/3fcfdca35752bc3a4a55b44d1d669eaeb12013a2))


### Code Refactoring

* Remove fs- and child_process-related exports from build-tools ([#15016](https://github.com/microsoft/FluidFramework/issues/15016)) ([a5d29a7](https://github.com/microsoft/FluidFramework/commit/a5d29a7fc36bae0ab90376bc7b63822af278b635))

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
