
## Note:

The instructions below are out of date. They might work partially but are not fully supported.

---


## Minikube

https://kubernetes.io/docs/tasks/tools/install-minikube/

### Windows

Enable Hyper-V (likely already happened when you installed Docker)

https://kubernetes.io/docs/tasks/tools/install-kubectl/

Simplest is to make use of Chocolatey to pull in kubectl and minikube as a package

Note all of the below need to be run from an admin command prompt

https://chocolatey.org/install
`choco install kubernetes-cli`
`choco install minikube`
`minikube.exe start --vm-driver=hyperv`

Running locally

To match Azure we create a few base resources

`kubectl apply -f system/minikube-ssd.yaml`

Installing base services

```
cd ../charts/kafka
helm install .
```

Reuse docker daemon

`eval $(minikube docker-env)`
