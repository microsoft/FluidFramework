# Prague

![Prague](http://wallpapers-best.com/uploads/posts/2015-09/18_prague.jpg)

Prague is investigating and prototyping key design questions around interactive documents and MUIs.

We're currently in the middle of [Sprint 2](./doc/sprints/sprint2/readme.md). Highlights include rich text, git based storage, and intelligent services in an augmentation loop.

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

We make use of https://hub.docker.com/r/microsoft/vsts-agent/ for building all of the source in this project.

To add a new agent to our pool simply run the following command

```
docker run \
    -d \
    --restart unless-stopped \
    -e VSTS_ACCOUNT=offnet \
    -e VSTS_TOKEN=<token> \
    -v /var/run/docker.sock:/var/run/docker.sock \
    microsoft/vsts-agent:ubuntu-16.04-docker-17.03.0-ce-standard
```