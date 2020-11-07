---
title: Quick Start
menuPosition: 2
codeCopyButton: true
---

In this Quick Start we will be getting a dice roller Fluid application up and running on your computer's
localhost. We've already embedded an instance of the application, with two clients, below. Click the **Roll**
button in either client to see how the state of the dice is shared between the two clients.

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.9af6bdd702e6cd4ad6cf.js" >}}

## Set up your development environment

To get started you need the following installed.

- [Node.js](https://nodejs.org/en/download) - {{< include file="_includes/node-versions.md" >}}
- Code Editor - We recommend [Visual Studio Code](https://code.visualstudio.com/).

We also recommend that you install the following:

- [Git](https://git-scm.com/downloads)

## Getting Started

Open a new command window and navigate to the folder you where you want to install the project, and then clone the [FluidHelloWorld repo](https://github.com/microsoft/FluidHelloWorld) with the
following commands. The cloning process will create a subfolder named FluidHelloWorld with the project files in it.

```bash
git clone https://github.com/microsoft/FluidHelloWorld.git
```

{{< callout note >}}

If you don't have git installed you can [click here](https://github.com/microsoft/FluidHelloWorld/archive/main.zip) to
download a zip of the FluidHelloWorld repo. Once the file downloads, extract the contents of the .zip file and run the
following steps.

{{< /callout >}}

Navigate to the newly created folder and install required dependencies.

```bash
cd FluidHelloWorld
```

```bash
npm install
```

Start both the client and server.

```bash
npm start
```

A new browser tab will open to <http://localhost:8080> and you will see the dice roller appear! To see collaboration in
action copy the full URL in the browser, including the ID, into a new window or even a different browser. This opens a
second client for your dice roller application. With both windows open, click the **Roll** button in either and note
that the state of the dice changes in both clients.

🥳**Congratulations**🎉 You have successfully taken the first step towards unlocking the world of Fluid collaboration.

## Next Steps

See the code for the dice roller app in the [tutorial](./tutorial.md).
