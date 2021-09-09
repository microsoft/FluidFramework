---
title: Quick Start
menuPosition: 1
codeCopyButton: true
aliases:
  - "/docs/get-started/quick-start/"
  - "/start/quick-start/"
  - "/docs/start/"

---

[broken link][]

Another [broken link](broken.md).

In this Quick Start you will be getting a dice roller Fluid application up and running first on your computer's
localhost.

{{< fluid_bundle_loader idPrefix="dice-roller"
bundleName="dice-roller.12142020.js" >}}

## Set up your development environment

To get started you need the following installed.

- [Node.js](https://nodejs.org/en/download) -- {{< include file="_includes/node-versions.md" >}}
- Code editor -- we recommend [Visual Studio Code](https://code.visualstudio.com/).

We also recommend that you install the following:

- [Git](https://git-scm.com/downloads)

## Getting started

Open a new command window and navigate to the folder you where you want to install the project, and then clone the
[FluidHelloWorld repo](https://github.com/microsoft/FluidHelloWorld) with the following commands. The cloning process
will create a subfolder named FluidHelloWorld with the project files in it.

```bash
git clone https://github.com/microsoft/FluidHelloWorld.git
```

{{< callout note >}}

If you don't have Git installed you can [click here](https://github.com/microsoft/FluidHelloWorld/archive/main.zip) to
download a zip of the FluidHelloWorld repo. Once the file downloads, extract the contents of the .zip file and run the
following steps.

{{< /callout >}}

Navigate to the newly created folder and install required dependencies.

```bash
cd FluidHelloWorld
npm install
```

Start both the client and a local server.

```bash
npm start
```

A new browser tab will open to <http://localhost:8080> and you will see the dice roller appear! To see collaboration in
action copy the full URL in the browser, including the ID, into a new window or even a different browser. This opens a
second client for your dice roller application. With both windows open, click the **Roll** button in either and note
that the state of the dice changes in both clients.


🥳**Congratulations**🎉 You have successfully taken the first step towards unlocking the world of Fluid collaboration.
