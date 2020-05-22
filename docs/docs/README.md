---
uid: get-started
---

# Getting Started

If you are new to the Fluid Framework, we recommend reading [What is Fluid?](../what-is-fluid.md) to orient yourself.

## Set up your development environment

First, you'll need to configure your development environment. You can use Visual Studio Code or your own custom
development environment to build Fluid Framework solutions. You can use a Windows, macOS, or Linux.

### Install developer tools

#### Install Node.js

Install [Node.js](https://nodejs.org/en/download/).

!!!include(node-versions.md)!!!

::: tip

**If you do not have Node.js already installed,** we strongly recommend using nvm to simplify installing and managing
multiple Node.js versions.

- [nvm for Windows](https://github.com/coreybutler/nvm-windows)
- [nvm for macOS/Linux](https://github.com/nvm-sh/nvm)

:::

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">

#### Install vsts-npm-auth (Windows only)

If you are using Windows, install vsts-npm-auth globally using the following command:

`npm install -g vsts-npm-auth --registry https://registry.npmjs.com --always-auth false`

This tool is used to simplify the use of [authenticated npm feeds](./package-feed.md).

</vue-markdown>

#### Install a code editor

You can use any code editor or IDE that supports TypeScript to build with Fluid, such as:

- [Visual Studio Code](https://code.visualstudio.com/)
- [Atom](https://atom.io)
- [Webstorm](https://www.jetbrains.com/webstorm)

#### Install Git

You'll need [Git](https://git-scm.com/) to use the [Fluid tutorials](../tutorials/README.md).

#### Install a modern browser

!!!include(browsers.md)!!!

## Next steps

Now that your development environment is set up, try [one of the tutorials](../tutorials/README.md), or read more about
[distributed data structures](./dds.md) and the [Fluid component model](./components.md).
