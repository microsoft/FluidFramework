# pnpm Tips and Tricks

pnpm has a rich filtering syntax to run on a subset of packages.
You can run commands only on packages that [match a particular scope](https://pnpm.io/filtering#--filter-package_name), [depend on specific other packages](https://pnpm.io/filtering#--filter-package_name-2), those that are [in a particular directory](https://pnpm.io/filtering#--filter-glob---filter-glob), and even [those that have been edited since a previous commit](https://pnpm.io/filtering#--filter-since).

Filtering can be done with most pnpm commands, including [exec](https://pnpm.io/cli/exec), [run](https://pnpm.io/cli/run), [add](https://pnpm.io/cli/add), and [remove](https://pnpm.io/cli/remove).

## Add dependencies only to packages with another dependency

This example adds mocha-multi-reporters and mocha-json-output-reporter as devDependencies to all packages in the release group that already depend on c8.

```shell
pnpm add -D --filter "...^c8" mocha-multi-reporters mocha-json-output-reporter
```

## Run format only on packages changed since main

```shell
pnpm run -r --filter "...[origin/main]" format
```
