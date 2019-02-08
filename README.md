# Prague

![Prague](http://wallpapers-best.com/uploads/posts/2015-09/18_prague.jpg)

Prague is investigating and prototyping key design questions around interactive documents and MUIs.

A listing of architectural design principals can be found in the [doc/architecture](./doc/architecture) folder. 

## Source Code Overview

[Routerlicious](./routerlicious) contains our latest prototype around new approaches to collaborative objects as well as a server backend to enable them with minimal COGS. This is probably where you want to start.

[Historian](./historian) provides a REST API to git repositories. The API is similar to that exposed by GitHub but can be used in local development.

[Augmentation](./augmentation) provides a set of augmentation loop services exposed via Docker containers.

[Collab-Editor](./collab-editor) is a Visual Studio Code plugin that enables collaborative editing of source code.

[Experiments](./experiments) contain experimental code or other prototypes.

[Doc](./doc) provides documentation for the project.

[Gitssh](./gitssh) is a git ssh server client container.

[Intelligence](./intelligence) contains a starter container for developing Python based intelligent services.

[legacy](./legacy) folder contains a set of legacy prototypes around a collaborative canvas. As well as MUIs that load within the browser or within an enlightened host.

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

## Demo Videos

[Prague demo](https://microsoft-my.sharepoint-df.com/:v:/p/kurtb/Ea-uge_KI31EuEBQFFQN9zQB_drBcnC6wBStB2Ur9ZWffw?e=OiDEWu)

[Translations](https://microsoft-my.sharepoint-df.com/:v:/p/kurtb/Ea-uge_KI31EuEBQFFQN9zQB_drBcnC6wBStB2Ur9ZWffw?e=OiDEWu)

## Stack Overflow
The Prague team answers questions on the [Microsoft internal stack overflow](https://stackoverflow.microsoft.com/) using the [tag Prague](https://stackoverflow.microsoft.com/questions/tagged/prague)

## Deployment Regions
To ensure minimal latency and smoother user experience, we deploy our backend in a few different Azure regions. If you are closer to west coast, use the following endpoints located at Washington:
* https://alfred.wu2.prague.office-int.com
* https://historian.wu2.prague.office-int.com

East coast developers are encouraged to use the following endpoints(located at Virginia):
* https://alfred.eu2.prague.office-int.com
* https://historian.eu2.prague.office-int.com

Developers in Europe can use the following endpoints (Located at Netherlands):
* https://alfred.we.prague.office-int.com
* https://historian.we.prague.office-int.com
