Nuclio and Kube experiments

##Get Nuclio Running

1. Apply Nuclio Access Policy (RBAC)
    1. kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/minikube/resources/kubedns-rbac.yaml
2. Create an docker registry in kube (N/A once using ACR or Verdaccio)
    1. minikube ssh -- docker run -d -p 5000:5000 registry:2
    2. Allow this registry to be accessed using preferences/daemon in the docker app (uri is $(minikube ip):5000)
3. Install Nuclio
    1. Create Namespace
        1. kubectl create namespace nuclio
    2. Create function deployment role
        1. kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/k8s/resources/nuclio-rbac.yaml
    3. Deploy Nuclio
        1. kubectl apply -f https://raw.githubusercontent.com/nuclio/nuclio/master/hack/k8s/resources/nuclio.yaml
4. Forward Dashboard
    1. kubectl port-forward -n nuclio $(kubectl get pods -n nuclio -l nuclio.io/app=dashboard -o jsonpath='{.items[0].metadata.name}') 8070:8070

##Get Kafka Running
1. Apply minikube ssd settings
    1. kubectl apply -f routerlicious/kubernetes/system/minikube-ssd.yaml
2. Install helm...
3. Install kafka chart
    1. cd ../charts/kafka
    2. helm install .


Profit?