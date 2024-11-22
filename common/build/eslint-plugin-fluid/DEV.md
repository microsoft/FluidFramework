# Publishing Guide for `@fluidframework/eslint-config-fluid` & `@fluid-internal/eslint-plugin-fluid`

This guide outlines the steps required to add new ESLint rules, update dependencies, and publish new versions of `@fluidframework/eslint-config-fluid` and `@fluid-internal/eslint-plugin-fluid`.

## Steps

### 1. Add New Rule to `eslint-plugin-fluid` (PR 1)

1. **Create the Rule**: Write the new rule following best practices for ESLint. If you need guidance, refer to [ESLint's rule documentation](https://eslint.org/docs/latest/developer-guide/working-with-rules).
	- [List of Custom Rules](https://github.com/microsoft/FluidFramework/tree/main/common/build/eslint-plugin-fluid/src/rules)

2. **Testing**: Ensure the rule is thoroughly tested. Tests help validate that the rule behaves as expected across various code scenarios.

   Directory structure:

   ```plaintext
   eslint-plugin-fluid/
   ├── src
   │   └── rules/					<!-- Contains the ESLint rule implementations -->
   │       ├── rule-one.js
   │       └── rule-two.js
   ├── test/
   │   ├── example/ 				<!-- Example mock files to test each rule in isolation -->
   │   │   ├── rule-one/
   │   │   │   ├── mockFileOne.js
   │   │   │   └── mockFileTwo.js
   │   │   └── rule-two/
   │   │       ├── mockFileOne.js
   │   │       └── mockFileTwo.js
   │   ├── rule-one/				<!-- Test suite for rule-one -->
   │   │   └── rule-one.test.js
   │   └── rule-two/				<!-- Test suite for rule-two -->
   │       └── rule-two.test.js
   ```

3. **Update Changelog**: Record the new rule in the `CHANGELOG.md` file of the `@fluid-internal/eslint-plugin-fluid` package. This provides visibility into what was added for future reference.

4. **Version Bump**: Update the version of `eslint-plugin-fluid` in its `package.json` following the [semantic versioning guidelines](https://semver.org/):
   - **Patch** version for fixes (backward-compatible)
   - **Minor** version for new rules (backward-compatible)
   - **Major** version for breaking changes

### 2. Publish New Version of `eslint-plugin-fluid`

Once PR 1 is merged, publish the new version of `@fluid-internal/eslint-plugin-fluid` by following the steps:

1. **Publish**: Publish the new version of `@fluid-internal/eslint-plugin-fluid` following the internal engineering documentation (Publishing _must_ be done by Microsoft Fluid team).

2. **Verify Release**: Confirm that the release was successful by checking the package version on the [NPM Registry](https://www.npmjs.com/package/@fluid-internal/eslint-plugin-fluid).

### 3. Update `eslint-config-fluid`'s Dependency on `eslint-plugin-fluid` (PR 2)

In `@fluidframework/eslint-config-fluid`, update the version of `@fluid-internal/eslint-plugin-fluid` to the newly published version:

### 4. Add New Rule to the Appropriate Config

Depending on the scope of the rule, add it to one of the following configurations (NOTE: `recommended.js` extends `minimal-deprecated.js`, and `strict.js` extends `recommended.js`):
   - `minimal-deprecated.js`
   - `recommended.js`
   - `strict.js`

1. **Update Changelog**: Record the change in `eslint-config-fluid`'s `CHANGELOG.md`.

2. **Version Bump**: Update the version of `eslint-config-fluid` in its `package.json`.

3. **Fix Violations in the Repo**:
   - Install the local version of `eslint-config-fluid` across relevant release groups.
   - Run the linter to identify and fix any violations locally.
   - To simplify integration, add the following to the `pnpmOverrides` section of the relevant `package.json` files (make sure *NOT* to check `pnpmOverrides` change in):
     ```json
     {
       "pnpmOverrides": {
         "@fluidframework/eslint-config-fluid": "file:<relative-path-to-eslint-config-fluid-package>"
       }
     }
     ```

### 5. Publish New Version of `eslint-config-fluid`

Once the PR is merged, publish the new version of `eslint-config-fluid` following the internal engineering documentation (Same as `eslint-plugin-fluid` package, `@fluidframework/eslint-config-fluid` _must_ be published by Microsoft Fluid team).

### 6. Update Dependencies on `eslint-config-fluid` Across the Repo (PR 3)

Once the new version of `eslint-config-fluid` is published, ensure all packages consuming `eslint-config-fluid` in the repository are updated to use the latest version. This includes updating the dependency in the `package.json` files and running a full test suite to confirm compatibility and stability across the repo.
