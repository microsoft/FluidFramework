# Developing `@fluidframework/eslint-config-fluid`

This guide outlines the steps required to add custom ESLint rules, update dependencies, and publish new versions of `@fluidframework/eslint-config-fluid`.

## Steps

### 1. Add a custom rule

1. **Create the Rule**: Write the new rule following best practices for ESLint. If you need guidance, refer to [ESLint's rule documentation](https://eslint.org/docs/latest/developer-guide/working-with-rules).
    - [List of Custom Rules](https://github.com/microsoft/FluidFramework/tree/main/common/build/eslint-config-fluid/src/rules)

2. **Testing**: Ensure the rule is thoroughly tested. Tests help validate that the rule behaves as expected across various code scenarios.

    Directory structure:

    ```plaintext
    eslint-config-fluid/
    └── src/
        └── rules/
            ├── index.cjs
            ├── rule-one.js
            ├── rule-two.js
            └── test/
                ├── rule-one.test.js
                ├── rule-two.test.js
                └── test-cases/
                    ├── rule-one/
                    └── rule-two/
    ```

3. **Register the rule**: Add the rule to `src/rules/index.cjs`, then enable it in the appropriate shared config.

4. **Update Changelog**: Record the new rule in `CHANGELOG.md`.

5. **Version Bump**: Update the version in `package.json` following the [semantic versioning guidelines](https://semver.org/):
    - **Patch** version for fixes (backward-compatible)
    - **Minor** version for new rules (backward-compatible)
    - **Major** version for breaking changes

### 2. Add the rule to the appropriate config

Depending on the scope of the rule, add it to one of the following configurations (NOTE: `recommended.js` extends `base.js`, and `strict.js` extends `recommended.js`):

- `base.js`
- `recommended.js`
- `strict.js`

1. **Update Changelog**: Record the change in `eslint-config-fluid`'s `CHANGELOG.md`.

2. **Version Bump**: Update the version of `eslint-config-fluid` in its `package.json`.

3. **Fix Violations in the Repo**:
    - Install the local version of `eslint-config-fluid` across relevant release groups.
    - Run the linter to identify and fix any violations locally.
    - To simplify integration, add the following to the `pnpmOverrides` section of the relevant `package.json` files (make sure _NOT_ to check `pnpmOverrides` change in):
        ```json
        {
        	"pnpmOverrides": {
        		"@fluidframework/eslint-config-fluid": "file:<relative-path-to-eslint-config-fluid-package>"
        	}
        }
        ```

### 3. Publish a new version

Once the PR is merged, publish the new version of `eslint-config-fluid` following the internal engineering documentation. `@fluidframework/eslint-config-fluid` must be published by the Microsoft Fluid team.

### 4. Update dependencies across the repo

Once the new version of `eslint-config-fluid` is published, ensure all packages consuming `eslint-config-fluid` in the repository are updated to use the latest version. This includes updating the dependency in the `package.json` files and running a full test suite to confirm compatibility and stability across the repo.
