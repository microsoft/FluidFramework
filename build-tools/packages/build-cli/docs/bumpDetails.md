# Further information about `bump deps`

The `bump deps` command is used to bump the dependency ranges of release groups or individual packages. It's easiest to
understand with an example.

Consider this section of package.json.

```json
"dependencies": {
    "@releasegroup1/app": "~1.3.0",
    "@releasegroup1/lib": "~1.3.0",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~1.28.2"
}
```

All of the dependencies are in the same repo. The first two dependencies listed are in a single release group, while the
other two are standalone packages.

When releasegroup1 publishes a prerelease version 1.4.0-12345, we want to bump the dependency range in the package above
to be `~1.4.0-12345`, which will pick up the new release. Doing that in one package with a release group that has only
two packages is straightforward. However, when a repo has dozens or hundreds of packages with lots of large release
groups, doing it manually becomes untenable.

The `bump deps` command automates this process. In the case above, we could use the following command to bump
releasegroup1 dependencies to `~1.4.0-12345`:

```shell
flub bump deps releasegroup1 --updateType latest --prerelease
```


```json
"dependencies": {
    "@releasegroup1/app": "~1.4.0-12345",
    "@releasegroup1/lib": "~1.4.0-12345",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~1.28.2"
}
```

### Bumping based on current dependency range

It is very helpful to bump a dependency based on its current value and a bump type, such as "major" or "minor". The
following command yields the same results as the above command:

```shell
flub bump deps releasegroup1 --updateType minor --prerelease
```

To bump to a release version instead, omit the `--prerelease` argument.

### Bumping standalone dependencies

Some packages are versioned independently from other release groups. In the example above, we could bump to the latest
released version of the eslint-config package across the whole repo using the following command:

```shell
flub bump deps @standalone/eslint-config --updateType latest
```

That command will update the package.json like so:

```json
"dependencies": {
    "@releasegroup1/app": "~1.3.0",
    "@releasegroup1/lib": "~1.3.0",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~2.0.0"
}
```

For more detailed usage information see the
[bump deps command reference](bump.md#flub-bump-deps-packageorreleasegroup).
