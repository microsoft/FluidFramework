# Prague

![Prague](http://wallpapers-best.com/uploads/posts/2015-09/18_prague.jpg)

Prague is investigating and prototyping key design questions around interactive documents and MUIs.

We're currently in the middle of [Sprint 4](./doc/sprints/sprint4/readme.md) and focused on self-hosting.

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

## Build Server

We make use of https://hub.docker.com/r/microsoft/vsts-agent/ for our build server agents.

To create an agent first create a work directory for the agent that maps exactly to how it will be mounted in the container (i.e. /var/lib/vsts - more on that below). Get a VSTS token. And then run the following command.

```
docker run \
  -d \
  --restart unless-stopped \
  -e VSTS_ACCOUNT=offnet \
  -e VSTS_TOKEN=<token> \
  -e VSTS_AGENT='$(hostname)-agent' \
  -e VSTS_WORK='/var/lib/vsts/$VSTS_AGENT' \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/vsts:/var/lib/vsts \
  microsoft/vsts-agent:ubuntu-16.04-docker-17.03.0-ce-standard 
```

The work directory must match between the host and container due to how we run Docker. We provide the container access to the host's Docker daemon by mounting the Docker socket. This is not "Docker in Docker" but does allow Docker commands to be executed inside the container. This appraoch is recommended in the vsts-agent documentation. But our build processes rely on being able to volume mount a local volume inside a running container in order to output artificats. As an example we run Helm and Kubernetes commands via a container. When sharing the Docker socket any volume mounts apply to the host's file system. Not the container executing the command's file system. To work around this we mount our VSTS_WORK directory inside the container in the same structure as on the host.
