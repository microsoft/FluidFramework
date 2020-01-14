---
uid: get-started
---

# Get Started

The quickest way to get started with Fluid is to build a component. First, you'll need to clone the Fluid Framework
repository and install [yo fluid](xref:yo-fluid).

<a name="fluid-repo" />

## Clone the Fluid repo

The repository is located at <https://github.com/Microsoft/FluidFramework/>.

> [!IMPORTANT]
> To gain access to the repo you must be part of the Microsoft organization on GitHub. You can do that by following the
> steps provided at [https://repos.opensource.microsoft.com/link](https://repos.opensource.microsoft.com/link).

After linking your accounts you should be added to the <https://github.com/orgs/Microsoft/teams/everyone> group which
will grant you access to the Fluid Framework repo. If for some reason you are not automatically added to that group
request to join at <https://repos.opensource.microsoft.com/Microsoft/teams/pragueread>.

## Install and run yo fluid


1. [Install and run yo fluid](xref:yo-fluid) to create a scaffold for your component, which you will build upon.
1. While implementing your component, you'll [use Fluid's local dev server to test your
   component.](./build-a-component.md#development-process) The local dev server will use the Fluid team's hosted Fluid
   service, called <xref:r11s>.
1. Once you're ready to share your component, you'll [publish it to
   Verdaccio,](./build-a-component.md#publish-your-package) the Fluid team's local NPM repository.
1. You can [use the Fluid Water Park](xref:water-park) to load any Fluid component from Verdaccio, including your own.

## Useful stuff

The Fluid packages are published to our [private NPM feed](xref:package-feed)
