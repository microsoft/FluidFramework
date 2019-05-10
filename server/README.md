# Fluid Reference Server Implementation

This directory contains our reference server implementation. [Routerlicious](./routerlicious) is the main composed server definition that pulls together multiple micro-services that provide the ordering and storage requirement of Fluid runtime.

[Admin](./admin) provides tenant management for Routerlicious

[Auspkn](./aupkn) provides REST API access to npm packages

[Charts](./charts) Kubernetes charts for the micro-services

[Gitrest](./gitrest) provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

[Gitssh](./gitssh) is a git ssh server client container.

[Headless-agent](./headless-agent) loads Prague components on a headless chromium browser.

[Historian](./historian) provides a REST API to git repositories. The API is similar to that exposed by GitHub but can be used in local development.

[Lambda](./lambda) serverless lambda version of Fluid services

[Routerlicious](./routerlicious) composed reference server implementation

[Service](./service) Experimental routerlicious with faster throughput


