## Minikube

https://kubernetes.io/docs/tasks/tools/install-minikube/

### Windows

Enable Hyper-V (likely already a happened when you installed Docker)

https://kubernetes.io/docs/tasks/tools/install-kubectl/

Simplest is to make use of Chocolatey to pull in kubectl and minikube as a package

Note all of the below need to be run from an admin command prompt

https://chocolatey.org/install
`choco install kubernetes-cli`
`choco install minikube`

`minikube.exe start --vm-driver=hyperv`