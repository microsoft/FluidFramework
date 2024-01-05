---
title: Quick Start V.2
menuPosition: 1
codeCopyButton: true
aliases:
  - "/docs/get-started/quick-start-sharedtree/"
  - "/start/quick-start-sharedtree/"
  - "/docs/start/"

---

In this Quick Start you will be getting a simple demo Fluid application up and running first on your computer's
localhost.

{{< callout note >}}

The demo app uses Fluid Framework 2.0, which is in preview. For a quick start that uses version 1.0, see [Quick Start V.1]({{< relref "quick-start.md" >}})

{{< /callout >}}


## Set up your development environment

To get started you need the following installed.

-   [Node.js](https://nodejs.org/en/download) -- {{< include file="_includes/node-versions.md" >}}
-   Code editor -- we recommend [Visual Studio Code](https://code.visualstudio.com/).
-   [Git](https://git-scm.com/downloads)

## Getting started

Open a new command window and navigate to the folder you where you want to install the project, and then clone the
[Simple Fluid demo](https://github.com/microsoft/FluidDemos/simple) with the following command. The cloning process
will create a subfolder named FluidHelloWorld with the project files in it.

```bash
git clone https://github.com/microsoft/simple.git
```

Navigate to the newly created folder and install required dependencies.

```bash
cd simple
npm install
```

Start both the client and a local server.

```bash
npm start
```

Open a browser tab to <http://localhost:3000> and you will see the demo app. To see collaboration in action copy the full URL in the browser, including the ID, into a new window or even a different browser. This opens a second client for the application. With both windows open, use the **Insert**, **Remove**, and **Move** buttons as instructed in the application and note that the state of the application changes in both clients.


🥳**Congratulations**🎉 You have successfully taken the first step towards unlocking the world of Fluid collaboration.

## Next step

Walk through the code of this demo app with [Tutorial: SharedTree demo]({{< relref "tutorial-sharedtree.md" >}})
