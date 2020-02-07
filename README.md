# Fluid

![Fluid](https://www.nasa.gov/sites/default/files/thumbnails/image/edu_fluid_large.jpg)

Fluid enables distributed, collaborative applications by providing developers with eventually consistent [Distributed
Data Structures](https://praguedocs.azurewebsites.net/get-started/dds.html), a flexible component and app model
("Chaincode"), and a reference server implementation with minimal COGS ("Routerlicious.")

Teams are using Fluid for low latency collaboration, zero setup data persistance, and on-by-default cross app
compatibility. Among other projects, our partner teams are building components for text editing, gaming, command line
tooling, and IoT.

## Build with Fluid

Use [Yo Fluid](./tools/generator-fluid/README.md) to get set up quickly after cloning the Fluid Framework repo.

First, do these one time steps:

````bash
npm install -g yo

cd .../FluidFramework/tools/generator-fluid

npm install
npm link
````

Yo Fluid is now ready. Try it!

````bash
yo @microsoft/fluid
````

[Components](./examples/components/README.md) has additional examples of building components with Fluid.

\* For Yo Fluid setup issues: [Unauthorized - Stack Overflow](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

### Adding a package

Update [Dockerfile](.\server\routerlicious\Dockerfile) with a reference to your package.json.  

Update [rush](./rush.json) with a reference to your package name.

## Documentation

[Fluid Docs](https://praguedocs.azurewebsites.net/) is our alpha version of our documentation and tutorial website.

## Stack Overflow

The Fluid team answers questions on the [Microsoft internal StackOverflow](https://stackoverflow.microsoft.com/) using
the [Fluid](https://stackoverflow.microsoft.com/questions/tagged/fluid) tag.


## FAQ

* How do I get started?
  * Check out [Yo Fluid](./tools/generator-fluid/README.md)
* Can I run Routerlicious locally?
  * Yes, see the [Routerlicious documentation](./server/routerlicious/README.md)
* Why can't I build or start docker?
  * [Allocate more than 4GB of RAM to Docker and share your harddrive with Docker](https://stackoverflow.microsoft.com/questions/137472/im-getting-docker-build-error-number-137)
* Why can't I install Fluid dependencies?
  * [You're probably having problems with npm and private npm registries](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)
* Is there a set of design principles I can look at?
  * Architectural design principals can be found in the [Fluid documentation](https://praguedocs.azurewebsites.net/architecture/readme.html).
* Do you have a homepage?
  * [Fluid Docs](https://praguedocs.azurewebsites.net/) is our alpha version of our documentation and tutorial website.
  * [Demo Portal](https://www.wu2-ppe.prague.office-int.com) is our prototype demo portal
* Why aren't commandline tools working?
  * [You may need to upgrade NPM or Node. We require above 5 and 8 respectively](https://stackoverflow.microsoft.com/questions/138019/yo-prague-fails-with-insight-track-firstcmd-args-slice0-2/138020#138020)
* Do you have any suggested reading before I get started?
  * Get hacking: check out [yo fluid!](./tools/generator-fluid/README.md)
  * If you need to read, check out our [architecture documents](https://praguedocs.azurewebsites.net/architecture/readme.html).
* [Can I contribute to Fluid?](https://stackoverflow.microsoft.com/questions/126025/can-i-contribute-to-the-prague-codebase/126026#126026)
  * Heck yeah.
* What is the difference between Fluid and Prague?
  * Prague was the initial code name for the project and prototype effort. Fluid (Framework) is the official name that was announced at //Build. We are in the process of transitioning the new name

## Demo Videos

[Fluid Highlight Reel](https://msit.microsoftstream.com/video/fde32402-b458-431e-b223-26a4cdfc350c)

[Translations](https://msit.microsoftstream.com/video/baf075cb-8718-4b16-aa73-400b64766317)

[Yo Fluid (Fluid Getting Started)](https://msit.microsoftstream.com/video/95532bfa-919e-4233-943e-55faaf418234)

[All Demos](https://msit.microsoftstream.com/channel/de63dd15-b6a2-4237-9fbc-2a2629b12fbc)

---

## Source Code Overview

[Examples/Components](./examples/components) contains our latest component and chaincode demos. This is the right place to get started checking out the world of Fluid.

[Packages](./packages) contains the core Fluid runtime

* [Loader](./packages/loader) startup code that loads Fluid container
* [Runtime](./packages/runtime) core Fluid runtime definition and distributed data structures
* [Framework](./packages/framework) base classes and interfaces for Fluid Framework that implements basic default behavior of components and containers
* [Drivers](./packages/drivers) contains the drivers targeting different server implementation endpoints (e.g. Routerlicious and ODSP)
* [Components](./packages/components) contains the component mechanism that enable components to be built on top of the Fluid runtime.  It also contains the sample Flow and Table components.
* [Hosts](./packages/hosts) contains code to host Fluid Containers within other applications
* [Server](./server) contains non-critical services that are especially tied into the loader and framework code

[Server](./server) contains the reference server implementation **Routerlicious**

[Docs](./docs) is the documentation source for [Fluid Docs](https://praguedocs.azurewebsites.net/)

* [Components Architecture](./docs/architecture/components) has documentation and diagrams for the component
  architecture.

* [Service Architecture](https://praguedocs.azurewebsites.net/architecture/readme.html) has documentation and diagrams of the service architecture.

## Further Reading

Architectural design principals can be found in the [Fluid documentation](https://praguedocs.azurewebsites.net/architecture/readme.html).

Developers looking to make deep/advanced Fluid changes can find our latest implementations in [Routerlicious](./server/routerlicious).

[Examples/legacy](./examples/experiments/legacy) folder contains a set of legacy prototypes around a collaborative canvas. As well as MUIs that load within the browser or within an enlightened host.

## Build Status

|Project|Status|
|-------|------|
|[Packages](./packages)|[![API Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/10/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=10)|
|[Routerlicious](./server/routerlicious)|[![Routerlicious Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/3/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=3)|
|[Admin](./server/admin)|[![Admin Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/17/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=17)|
|[Auspkn](./server/auspkn)|[![Auspkn Build Status](https://offnet.visualstudio.com/officenet/_apis/build/status/server/server%20-%20auspkn?branchName=master)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=25)
|[Historian](./server/historian)|[![Historian Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/7/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=7)|
|[Historian Chart](./server/charts/historian)|[![Historian Chart Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/13/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=13)|
|[Cobalt](https://offnet.visualstudio.com/officenet/_git/cobalt-netcore)|[![Gitresources Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/12/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=12)|
|[GitSSH](./server/gitssh)|[![GitSSH Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/5/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=5)|
|[GitRest](./server/gitrest)|[![GitRest Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/8/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=8)|
|[Headless Chrome](./tools/headless-chrome)|[![Headless Chrome Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/19/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=19)|
|[Fluid metrics](./tools/fluid-metrics)|[![Metrics Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/20/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=20)|
|[Fluid metrics chart](./server/charts/fluid-metrics)|[![Fluid Metrics Chart Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/21/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=21)|

## Deployment Regions
To ensure minimal latency and smoother user experience, we deploy our backend in a few different Azure regions. If you are closer to west coast, use the following endpoints located at Washington:
* https://alfred.wu2.prague.office-int.com
* https://historian.wu2.prague.office-int.com

Our code is deployed immediately after check in to:
* https://www.wu2-ppe.prague.office-int.com
* https://historian.wu2.prague.office-int.com

East coast developers are encouraged to use the following endpoints(located at Virginia):
* https://alfred.eu2.prague.office-int.com
* https://historian.eu2.prague.office-int.com

Developers in Europe can use the following endpoints (Located at Netherlands):
* https://alfred.we.prague.office-int.com
* https://historian.we.prague.office-int.com
