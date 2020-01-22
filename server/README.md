# Fluid Reference Server Implementation

This directory contains our reference server implementation. [Routerlicious](./routerlicious) is the main composed server definition that pulls together multiple micro-services that provide the ordering and storage requirement of Fluid runtime.

[Admin](./admin) provides tenant management for Routerlicious

[Auspkn](./auspkn) provides REST API access to npm packages

[Charts](./charts) Kubernetes charts for the micro-services

[Gitrest](./gitrest) provides a REST API to a GitHub repository. It's API is based off of GitHub's REST APIs.

[Gitssh](./gitssh) is a git ssh server client container.

[Headless-agent](./headless-agent) loads Fluid components on a headless chromium browser.

[Historian](./historian) provides a REST API to git repositories. The API is similar to that exposed by GitHub but can be used in local development.

[Lambdas](./lambdas) serverless lambda version of Fluid services

[Routerlicious](./routerlicious) composed reference server implementation

[Service](./service) Experimental routerlicious with faster throughput


# Deployment System

(First Pass Primer)

## Tools

We use Kubernetes (Mostly AKS and a self managed deployment in WUS2), we deploy via Helm Charts. Resource acquisition is through az (Azure CLI) and portal.azure.com

## Example Deployment

Historian, Bolshoi, and Gateway are models for how to do deployment
1. Build Runtime Container
    * Builds and publishes docker container with the production code
    * e.g. <https://offnet.visualstudio.com/officenet/_apps/hub/ms.vss-ciworkflow.build-ci-hub?_a=edit-build-definition&id=99>
2. Build a chart container
    * Bundles **"Helm Charts"** via ```'helm package .' ```
    * Publishes this bundle for consumption
    * e.g. <https://offnet.visualstudio.com/officenet/_apps/hub/ms.vss-ciworkflow.build-ci-hub?_a=edit-build-definition&id=100>
    * *Practical Concerns*
      * Keep track of where you publish this bundle to, it's created as artifact and is consumed by step 3.
3. Deploy the package
    * Override the values.yaml file (one of the **"Helm Charts"** files)
    * Deploys via ```'helm upgrade ...'```
    * e.g. <https://offnet.visualstudio.com/officenet/_releaseDefinition?definitionId=22&_a=definition-tasks&environmentId=64>
    * *Practical Concerns*
      * The container is picking up the artifact from step 2 via volume mount, so volumes and working dir both need to be correct

## Helm Charts

[Helm Charts](https://github.com/helm/charts) define a Kubernetes deployment. They should have all the resource definitions needed to run the service, tool, app etc. you're running in Kube.

We use Helm charts from [Helm Hub](https://hub.helm.sh/) to deploy Mongo, Kafka, Redis, etc, similar to how we might use homebrew or npm for other dependencies.

We also build our own Helm charts for our own services.

### Example + Explanations

```
charts
│   README.md
│   Chart.yaml
|   values.yaml
|   possibleAdditionalValuesFile.yaml    
│
└───templates
│   │   configmap.yaml
│   │   deployment.yaml
│   │   ingress.yaml
│   │   service.yaml
│   │   _helpers.tpl
```

#### Chart.yaml
* Name of the chart (deployment)
* Description

#### values.yaml
* A config for our deployment
  * The templates reference values to get deployment specific information e.g. ``` {{ .Values.alfred.endpoint }} ```
  * The templating language lets you use a few other files as well i.e. ```{{ .Release. }} ``` and ``` {{.Chart.}} ```
* Fluid overrides these values in Step 3. (Deploy the Package)
* We leave values.yaml to show what values are *expected* by the rest of the deployment
* As of 1/17/2020, we intend to switch to *extending* the values file instead of wholesale overwriting it on offnet

#### configmap.yaml
* Defines the config.json file that will be accessible by the runtime
* values are populated mostly from the values.yaml file

#### _helpers.tpl
* Templating tool allowing for more advanced values like ```{{template "fullname"}} ```
  * In this case fullname is combining values from .Release, .Chart, and .Values

#### deployment.yaml, ingress.yaml, service.yaml
* Define the kube deployment, ingress, service

## Useful Tools
Kubernetes
* Credentials - To get all Kubectl Credentials
```
> az login

> az aks get-credentials --name PragueKubeWestEurope --resource-group PragueKubeWestEurope

> kubectl config get-contexts 
// Should indicate you're using west europe
```
* proxy ```'kubectl proxy'```
  * This often worked poorly for me, I had to go directly to ```http://localhost:8001/api/v1/namespaces/kube-system/services/kubernetes-dashboard/proxy``` to access the dashboard

Helm
* Package and deploy example
```
> helm package .\charts
> helm upgrade --kube-context PragueKubeWestEurope -i -f .\charts\values.yaml service-name gateway-0.1.0.tgz
```

## Legacy (Exists as of 1/17/2020)
Before we understood helm/offnet fully, we deployed using a generateCharts.js script. This isn't necessary and should be removed.

## Gotchas
* We have different version of kubernetes on our deployments. kubectl and helm CLIs must be within one version of the service, so may need to download executables for each environment