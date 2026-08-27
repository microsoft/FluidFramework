# Oxlint migration evidence

This document records the evidence behind the client release group's hybrid
ESLint and Oxlint milestone. It does not claim diagnostic parity.

## Scope

| Linter | Package targets | Policy |
| --- | ---: | --- |
| ESLint 9.39.1 | 164 | Existing package-specific ESLint configurations |
| Oxlint 1.80.0 with oxlint-tsgolint 7.0.2001 | 161 | Oxlint defaults plus the shared type-aware configuration |

The three ESLint-only packages and their removal conditions are:

| Package | Current blocker |
| --- | --- |
| `@fluidframework/core-interfaces` | `opaqueJson.spec.ts` can hang tsgolint while constructing the type-aware program. |
| `@fluidframework/driver-web-cache` | The attempted configuration reports two Oxlint-only `no-misused-promises` errors. |
| `@fluid-private/test-end-to-end-tests` | tsgolint cannot resolve the package's `@fluid-internal/test-driver-definitions` TypeScript configuration. |

## Effective rule coverage

`oxlint --type-aware --print-config` for a production TypeScript file reports
112 active rules:

| Rule family | Active rules |
| --- | ---: |
| ESLint core-compatible | 57 |
| TypeScript | 28 |
| Unicorn | 13 |
| Oxc-specific | 14 |

The shared configuration explicitly promotes
`typescript/no-floating-promises` and `typescript/no-misused-promises` to
errors. Oxlint's other default correctness rules remain warnings. Test files
downgrade the two promoted rules to warnings, preserving the existing
package-level `--quiet` behavior.

The shared strict ESLint preset has 286 active rules. After normalizing
`@typescript-eslint/<rule>` to `typescript/<rule>` and `import-x/<rule>` to
`import/<rule>`:

| Comparison against the strict ESLint preset | Rules |
| --- | ---: |
| Active in the current Oxlint pass under the same rule name | 69 |
| Still covered only by ESLint or awaiting behavioral validation | 217 |
| Additional active Oxlint rules with no active same-name strict ESLint rule | 43 |

This is why the milestone keeps ESLint in `lint:code`: the current Oxlint pass
adds fast, type-aware coverage but is not yet a replacement.

### Diagnostic fixture

A temporary production TypeScript fixture containing an unhandled promise and
an async `forEach` callback produced the expected error from both tools:

| Fixture defect | ESLint | Oxlint |
| --- | --- | --- |
| Unhandled promise | `@typescript-eslint/no-floating-promises` | `typescript(no-floating-promises)` |
| Promise returned where `void` is expected | `@typescript-eslint/no-misused-promises` | `typescript(no-misused-promises)` |

Oxlint reported exactly those two errors. ESLint reported those two plus two
existing Unicorn policy errors, demonstrating both the migrated behavior and
why the compatibility pass is still required.

## Native migration potential and remaining gaps

With every available native category enabled, plus the import, React, JSDoc,
and Promise plugins, Oxlint 1.80.0 reports 608 registered rules. Of the 286
active rules in Fluid's strict ESLint preset, 241 (84.3%) have a native
same-name Oxlint rule after the namespace normalization above.

The remaining 45 rules without a same-name native Oxlint rule are:

| ESLint rule family | Rules |
| --- | ---: |
| `@eslint-community/eslint-comments` | 6 |
| Fluid custom rules | 5 |
| `@typescript-eslint` | 6 |
| ESLint core | 7 |
| `import-x` | 6 |
| JSDoc | 8 |
| Unicorn | 3 |
| Rushstack, Depend, TSDoc, unused-imports | 4 |

The five Fluid custom rules are:

- `no-file-path-links-in-jsdoc`
- `no-hyphen-after-jsdoc-tag`
- `no-markdown-links-in-jsdoc`
- `no-member-release-tags`
- `no-unchecked-record-access`

The other gaps are:

- `@eslint-community/eslint-comments`: `disable-enable-pair`,
  `no-aggregating-enable`, `no-duplicate-disable`, `no-unlimited-disable`,
  `no-unused-enable`, `require-description`
- `@typescript-eslint`: `naming-convention`, `no-array-constructor`,
  `no-restricted-imports`, `no-shadow`, `no-unused-expressions`,
  `prefer-optional-chain`
- ESLint core: `no-multi-spaces`, `no-octal`, `no-octal-escape`,
  `no-restricted-syntax`, `no-undef-init`, `require-atomic-updates`,
  `spaced-comment`
- `import-x`: `export`, `no-deprecated`, `no-extraneous-dependencies`,
  `no-internal-modules`, `no-unresolved`, `no-unused-modules`
- JSDoc: `check-indentation`, `check-line-alignment`, `multiline-blocks`,
  `no-bad-blocks`, `require-asterisk-prefix`, `require-description`,
  `require-hyphen-before-param-description`, `require-jsdoc`
- Unicorn: `better-regex`, `no-unnecessary-polyfills`, `prefer-switch`
- `@rushstack/no-new-null`, `depend/ban-dependencies`, `tsdoc/syntax`, and
  `unused-imports/no-unused-imports`

Same-name availability is an upper bound, not parity evidence. Options,
resolver behavior, processors, fixes, severity, and exact diagnostics still
need validation. In particular, attempted enablement found behavioral
differences for `strict-boolean-expressions` and `unbound-method`; those rules
remain covered by ESLint.

## Runtime

All integrated timings use Node.js 22.22.3 and pnpm 11.15.1 on Windows. Each
package target is matched explicitly and Fluid Build runs with `--force` so
incremental done-file caching cannot skip either linter.

| Recorded run | ESLint, 164 packages | Oxlint, 161 packages |
| --- | ---: | ---: |
| 1 | 817.391s | 313.032s |
| 2 | 680.763s | 315.839s |
| 3 | 720.988s | 345.325s |
| **Median** | **720.988s** | **315.839s** |
| **Mean** | **739.714s** | **324.732s** |

The end-to-end median is 12m 1s for ESLint and 5m 16s for Oxlint: Oxlint is
2.28x faster and saves 6m 45s (56.2%) in this forced Fluid Build scenario.
All six recorded runs exited successfully.

The benchmark alternated ESLint and Oxlint after one warm-up run of each.
Visible validation runs confirmed 164 ESLint and 161 Oxlint packages matched,
with no tasks skipped. Both commands used the same type-aware prerequisite
graph and `--worker`; `--force` means these are integrated task costs,
including forced prerequisites, rather than isolated linter-engine timings.
The package counts also differ by the three documented ESLint-only fallbacks.

The earlier feasibility experiment in `OXLINT_MIGRATION_PLAN.md` measured a
12.4x engine-level speedup for Tree and a 13.3x upper-bound client lint ratio.
Those results established migration value but are not parity benchmarks.

## Reproducing the rule counts

Print the effective milestone configuration from a supported package:

```powershell
Push-Location packages\common\client-utils
pnpm exec oxlint --type-aware --config ../../../.oxlintrc.json `
  --print-config src/buffer.ts
Pop-Location
```

Print all registered native rules used for the same-name support comparison:

```powershell
Push-Location packages\common\client-utils
pnpm exec oxlint --type-aware --import-plugin --react-plugin --jsdoc-plugin `
  --promise-plugin -D all --print-config src/buffer.ts
Pop-Location
```

For the runtime benchmark, collect package directories from tracked
`package.json` files that define the relevant script, then pass all directories
explicitly:

```powershell
$manifests = git ls-files -- azure examples experimental packages |
  Where-Object { $_ -match 'package\.json$' }
$packages = $manifests | ForEach-Object {
  $manifest = Get-Content $_ -Raw | ConvertFrom-Json
  [pscustomobject]@{
    Path = Split-Path $_
    ESLint = [bool]$manifest.scripts.eslint
    Oxlint = [bool]$manifest.scripts.oxlint
  }
}
$eslintPackages = $packages | Where-Object ESLint | ForEach-Object Path
$oxlintPackages = $packages | Where-Object Oxlint | ForEach-Object Path

pnpm exec fluid-build --task eslint --force --worker @eslintPackages
pnpm exec fluid-build --task oxlint --force --worker @oxlintPackages
```
