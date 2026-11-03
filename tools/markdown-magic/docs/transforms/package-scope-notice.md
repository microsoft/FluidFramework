# `package-scope-notice`

Use `package-scope-notice` to generate a support notice for a Fluid package kind.

By default, the transform detects the kind from the package name in `package.json`. An explicit `scopeKind` overrides this detection.

## Options

| Option            | Type   | Default                        | Description                                             |
| ----------------- | ------ | ------------------------------ | ------------------------------------------------------- |
| `packageJsonPath` | string | `./package.json`               | Package file path relative to the destination document. |
| `scopeKind`       | string | Detected from the package name | Package kind for the notice.                            |

Valid values for `scopeKind` are `FRAMEWORK`, `EXAMPLE`, `EXPERIMENTAL`, `INTERNAL`, `PRIVATE`, and `TOOLS`. `FRAMEWORK` generates no notice. An unrecognized package scope also generates no notice when `scopeKind` is absent.

## Example

The following marker generates the notice for an internal package:

```markdown
<!-- markdown-magic:begin {"transform":"package-scope-notice","scopeKind":"INTERNAL"} -->
<!-- markdown-magic:end -->
```
