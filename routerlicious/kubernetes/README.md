# Kubernetes deployment

## Cluster preparation
Instructions on how to prepare a Kubernetes cluster on Azure can be found [here](azure.md).

## Routerlicious deployment
And then how to deploy Routerlicious to that cluster [here](stack.md).

## Useful add-ons

### Kubernetes dashboard
`kubectl create -f https://git.io/kube-dashboard`

### Weave dashboard
`kubectl apply --namespace kube-system -f "https://cloud.weave.works/k8s/scope.yaml?k8s-version=$(kubectl version | base64 | tr -d '\n')"`
