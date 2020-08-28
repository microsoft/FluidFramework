---
title: Quick Start
menuPosition: 2
codeCopyButton: true
---

In this Quick Start we will be getting the following [Hello World](https://github.com/microsoft/FluidHelloWorld) Fluid application
running locally on your machine.

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.9af6bdd702e6cd4ad6cf.js" >}}

## Set up your development environment

To get started you need the following installed.

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/download) - {{< include file="_includes/node-versions.md" >}}
- Code Editor - We recommend [Visual Studio Code](https://code.visualstudio.com/)

{{< callout tip >}}

We recommend using nvm (for [Windows](https://github.com/coreybutler/nvm-windows) or
[MacOS/Linux](https://github.com/nvm-sh/nvm)) to install Node.js, in case you find yourself needing multiple
versions of Node.js.

{{< /callout >}}

## Getting Started

Open a new commanding window and clone the [FluidHelloWorld repo](https://github.com/microsoft/FluidHelloWorld) with the
following command.

```bash
git clone https://github.com/microsoft/FluidHelloWorld.git
```

{{< callout note >}}

If you don't have git available you can [click here](https://github.com/microsoft/FluidHelloWorld/archive/main.zip) to
download a zip of the FluidHelloWorld repo. Once the file downloads, extract the contents of the .zip file and run the
following steps.

{{< /callout >}}

Navigate to the newly created folder and install required dependencies.

```bash
cd FluidHelloWorld
```

```bash
npm i
```

Start both the client and server.

```bash
npm start
```

A new browser tab will open to [http://localhost:8080](http://localhost:8080) and you will see the Dice Roller appear!
To see collaboration in action copy the full url in the browser, including the id, into a new tab.

🥳**Congratulations**🎉 You have successfully taken the first step towards unlocking the world of Fluid collaboration.

## Next Steps

### Explore the code

Using your code editor, open the FluidHelloWorld folder and navigate to the `./src` sub-folder. Any changes to these files will
automatically trigger a re-render on any open tabs.

### Hello World Tutorial

You can find a complete walk though of this code on our [Tutorial](./tutorial.md) page.

### Playground

Checkout our [Playground](//ADD LINK) to discover more examples in the browser.

### Advanced Examples

For more advanced examples, and their code, navigate to our [Examples](./examples.md) page.
