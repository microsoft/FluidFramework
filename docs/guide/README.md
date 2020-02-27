---
uid: get-started
---

# Getting Started

If you are new to the Fluid Framework, we recommend reading [What is Fluid?](../what-is-fluid.md) to orient yourself.

## Set up your development environment

First, you'll need to configure your development environment. You can use Visual Studio Code or your own custom
development environment to build Fluid Framework solutions. You can use a Windows, macOS, or Linux.

### Install developer tools

#### Install NodeJS

::: important
You **must** use [NodeJS LTS version 10](https://nodejs.org/dist/latest-v10.x/). There are known bugs on other NodeJS versions.
:::

- If you are using Windows, you can use the msi installers
  ([x86](https://nodejs.org/dist/latest-v10.x/node-v10.19.0-x86.msi) or
  [x64](https://nodejs.org/dist/latest-v10.x/node-v10.19.0-x64.msi)) for the easiest way to set up NodeJS
  (notice that these direct links evolve over time, so check the latest v10 from the above directory).
- If you have NodeJS already installed, check that you have the correct version by using `node -v`. It should return
  version 10.19.0.

::: tip
If you do not have NodeJS already installed, we recommend using nvm to simplify installing and managing
multiple NodeJS versions.

* [nvm for Windows](https://github.com/coreybutler/nvm-windows)
* [nvm for macOS/Linux](https://github.com/nvm-sh/nvm)
:::

#### Install a code editor

You can use any code editor or IDE that supports TypeScript to build with Fluid, such as:

- [Visual Studio Code](https://code.visualstudio.com/)
- [Atom](https://atom.io)
- [Webstorm](https://www.jetbrains.com/webstorm)

#### Install Git

You'll need [Git](https://git-scm.com/) to use the [Fluid tutorials](../examples/README.md).

#### Install a Chromium-based browser

!!!include(../includes/browsers.md)!!!

## Next steps

Now that your development environment is set up, try one of the tutorials, or read more about [distributed data
structures](./dds.md) or the [Fluid component model](./components.md).
