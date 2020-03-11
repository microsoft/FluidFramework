---
uid: package-feed
---

# Fluid private NPM feed

Fluid packages are published on our [private npm
feed](https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=fluid).

You will need to authenticate with this feed in order to install Fluid package and their dependencies.

## Windows

On Windows, all of the [Fluid tutorials](../examples/README.md) include npm tasks to help authenticate. Make sure you
have [installed vsts-npm-auth globally](./README.md#install-vsts-npm-auth-windows-only), then run the following command
from the tutorial folder: `npm run auth`

Once the command succeeds, you can proceed to `npm install` dependencies from the private NPM feed.

If the `npm run auth` command fails, you can follow the instructions for macOS and Linux below.

## macOS/Linux

On macOS and Linux, you must create a personal access token and add it to your `.npmrc` manually.

First, visit the [private npm
feed](https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=fluid) in a browser and
follow the instructions at
<https://docs.microsoft.com/en-us/azure/devops/artifacts/npm/npmrc?view=azure-devops&tabs=windows#linux-or-mac>.
