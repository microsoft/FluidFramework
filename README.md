# Prague

![Prague](http://wallpapers-best.com/uploads/posts/2015-09/18_prague.jpg)

Prague enables distributed, collaborative applications by providing developers with eventually consistent "Distributed Data Types", a flexible component and app model ("Chaincode"), and a reference server implementation ("Routerlicious.")

Teams are using Prague for low latency collaboration, zero setup data persistance, and on-by-default cross app compatibility. Among other projects, our partner teams are building components for text editing, gaming, command line tooling, and IOT.

## Build with Prague

Use [Yo Prague](./tools/generator-prague/README.md) to get set up quickly.

First, do these one time steps:

````bash
npm install -g yo

cd .../Prague/tools/generator-prague

npm install
npm link
````

Yo Prague is now ready. Try it!
````bash
yo prague
````

[Chaincode](./samples/chaincode/README.md) has additional examples of building components with Prague.

\* For Yo Prague setup issues: [Unauthorized - Stack Overflow](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

## Stack Overflow
The Prague team answers questions on the [Microsoft internal stack overflow](https://stackoverflow.microsoft.com/) using the [tag Prague](https://stackoverflow.microsoft.com/questions/tagged/prague)

## FAQ

* Why can't I build or start docker?
  * [Allocate more than 4GB of RAM to Docker and share your harddrive with Docker](https://stackoverflow.microsoft.com/questions/137472/im-getting-docker-build-error-number-137)
* Why can't I install Prague dependencies?
  * [You're probably having problems with npm and private npm registries](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)
* Is there a set of design principles I can look at?
  * Architectural design principals can be found in the [doc/architecture](./doc/architecture) folder. 
* How do I get started?
  * Check out [Yo Prague](./tools/generator-prague/README.md)
* Do you have a homepage?
  * [Yep.](https://www.wu2-ppe.prague.office-int.com)
* Why aren't commandline tools working?
  * [You may need to upgrade NPM or Node. We require above 5 and 8 respectively](https://stackoverflow.microsoft.com/questions/138019/yo-prague-fails-with-insight-track-firstcmd-args-slice0-2/138020#138020)
* Do you have any suggested reading before I get started?
  * Get hacking: check out yo prague!
  * If you need to read, check out our [architecture documents](./doc/architecture)
* [Can I contribute to Prague?](https://stackoverflow.microsoft.com/questions/126025/can-i-contribute-to-the-prague-codebase/126026#126026)
  * Heck yeah.

## Further Reading
Architectural design principals can be found in the [doc/architecture](./doc/architecture) folder.

Developers looking to make deep/advanced Prague changes can find our latest implementations in [Routerlicious](./routerlicious).

## Demo Videos
[Prague Highlight Reel](https://msit.microsoftstream.com/video/fde32402-b458-431e-b223-26a4cdfc350c)

[Translations](https://msit.microsoftstream.com/video/baf075cb-8718-4b16-aa73-400b64766317)

[Yo Prague (Prague Getting Started)](https://msit.microsoftstream.com/video/95532bfa-919e-4233-943e-55faaf418234)

[All Demos](https://msit.microsoftstream.com/channel/de63dd15-b6a2-4237-9fbc-2a2629b12fbc)


<br />
<br />

---

## Source Code Overview

[Chaincode](./samples/chaincode) contains our latest component and chaincode demos. This is the right place to get started checking out the world of Prague.

[Packages](./packages) is the service we call Routerlicious. This folder is our prototype around new approaches to collaborative objects as well as a server backend to enable them with minimal COGS.

[Service Architecture](./docs/architecture) has documentation and diagrams of the service architecture.

[Components Architecture](./docs/architecture/components) has documentation and diagrams for the component architecture.

[Doc](./docs) provides documentation for the project.

[Historian](./server/historian) provides a REST API to git repositories. The API is similar to that exposed by GitHub but can be used in local development.

[Gitssh](./server/gitssh) is a git ssh server client container.

[legacy](./samples/experiments/legacy) folder contains a set of legacy prototypes around a collaborative canvas. As well as MUIs that load within the browser or within an enlightened host.


## Build Status

|Project|Status|
|-------|------|
|[Routerlicious](./routerlicious)|[![Routerlicious Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/3/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=3)|
|[API](./routerlicious)|[![API Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/10/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=10)|
|[Admin](./admin)|[![Admin Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/17/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=17)|
|[Augloop-Runtime](./augloop-runtime)|[![Augloop-Runtime Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/22/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=22)|
|[Historian](./historian)|[![Historian Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/7/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=7)|
|[Historian Chart](./charts/historian)|[![Historian Chart Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/13/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=13)|
|[Cobalt](https://offnet.visualstudio.com/officenet/_git/cobalt-netcore)|[![Gitresources Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/12/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=12)|
|[GitSSH](./gitssh)|[![GitSSH Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/5/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=5)|
|[GitRest](./gitrest)|[![GitRest Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/8/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=8)|
|[Apps](./apps)|[![Apps Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/16/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=16)|
|[Headless Chrome](./tools/headless-chrome)|[![Headless Chrome Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/19/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=19)|
|[Prague metrics](./tools/prague-metrics)|[![Metrics Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/20/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=20)|
|[Prague metrics chart](./charts/prague-metrics)|[![Prague Metrics Chart Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/21/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=21)|

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
