Nuclio and Kube experiments

##Get Nuclio Running

1. Apply Nuclio Access Policy (RBAC)
    1. `kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/minikube/resources/kubedns-rbac.yaml`
2. Create an docker registry in kube (N/A once using ACR or Verdaccio)
    1. `minikube ssh -- docker run -d -p 5000:5000 registry:2`
    2. Allow this registry to be accessed using preferences/daemon in the docker app (uri is $(minikube ip):5000)
3. Install Nuclio
    1. Create Namespace
        1. kubectl create namespace nuclio
    2. Create function deployment role
        1. `kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/k8s/resources/nuclio-rbac.yaml`
    3. Deploy Nuclio
        1. `kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/k8s/resources/nuclio.yaml`
4. Forward Dashboard
    1. `kubectl port-forward -n nuclio $(kubectl get pods -n nuclio -l nuclio.io/app=dashboard -o jsonpath='{.items[0].metadata.name}') 8070:8070`

## Get Kafka Running
1. Apply minikube ssd settings to mimic our azure settings
    1. `kubectl apply -f routerlicious/kubernetes/system/minikube-ssd.yaml`
2. Install helm...
3. Install kafka chart
    1. `cd ../charts/kafka`
    2. `helm install .`

## Create Example Kafka Producer and Consumer
1. Create a producer
    1. Create an empty NodeJS lambda
    2. Drop lambdas/producer-lambda.js into the editor
    3. Update the endpoint variable with Zookeeper {Zookeeper IP}:{PORT}
        1. `kubectl get endpoints --namespace nuclio`
    4. Add Packages
        1. Configuration -> Build -> Build Commands includes `npm install kafka-node`
2. Create a consumer
    1. Create an empty NodeJS lambda
    2. Drop lambdas/consumer-lambda.js into the editor
    3. Add Packages
        1. Configuration -> Build -> Build Commands includes `npm install request`
    4. Add Trigger
        1. Class = Kafka
        2. URL = {Kafka IP}:{PORT}
        3. Partitions = 0
            1. Because we publish to partition 0
        4. Topic = deltas
            1. Because we publish to the deltas topic
3. Create some way of verifying this flow
    1. Go into the verification Server
    2. npm run ngrok
        1. Note the public URL here. You're going to sub this into the consumer lambda
    3. npm run start
4. Trigger the producer lambda and watch the public URL

## Profit?

### Notes
If you want the nuclio cli (nuctl) and you're confused. try
`chmod +x nuctl-0.4.0-darwin-amd64`
`./nuctl-0.4.0-darwin-amd64` This should give you your cli

`./nuctl -n nuclio get project` should return your project.

## Deploy To Azure
https://nuclio.io/docs/latest/setup/aks/getting-started-aks/

### Initial Setup
1. Create the resource group
    1. az acr create --resource-group Prague --name PragueLambdas --sku basic
2. Create a service principal for nuclio so that nuclio can create docker containers
    1. az ad sp create-for-rbac --role Contributor --scopes /subscriptions/$(az account show --query id -o tsv)/resourcegroups/Prague/providers/Microsoft.ContainerRegistry/registries/PragueLambdas --role Contributor --name NuclioACR-ServicePrincipal
        {
        "appId": "bc3c23f4-6fef-4a6d-8586-ef7b8fc891b8", // AKA Client_ID
        "displayName": "NuclioACR-ServicePrincipal",
        "name": "http://NuclioACR-ServicePrincipal",
        "password": // AKA Client_secret
        "tenant": "72f988bf-86f1-41af-91ab-2d7cd011db47"
        }
3. Create a secret to authenticate nuclio with kubernetes
    1. kubectl create secret docker-registry registry-credentials --namespace nuclio --docker-username NuclioACR-ServicePrincipal --docker-password $mypassword --docker-server praguelambdas.azurecr.io --docker-email ignored@nuclio.io
4. Limit, but Enable Nuclio
    1.  create a nuclio namespace and apply nuclios rbac, which is limited to the nuclio namespace
    2. kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/k8s/resources/nuclio-rbac.yaml
5. docker login praguelambdas.azurecr.io -u bc3c23f4-6fef-4a6d-8586-ef7b8fc891b8
6. Port Forward
    1. kubectl port-forward -n nuclio $(kubectl get pods -n nuclio -l nuclio.io/app=dashboard -o jsonpath='{.items[0].metadata.name}') 8070:8070
