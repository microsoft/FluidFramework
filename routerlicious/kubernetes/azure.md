## Provisioning a new VM

Managed disk are not yet supported with Kubernetes persistent volume claims. So unfortunately we need aren't able to use this feature yet and so must provision VMs with this disabled.

### VM Setup

Since we can't use managed disks it also looks like we can't easily create a new VM from an image. Run the following steps to setup a new Kubernetes machine. There are easier ways to do this (Chef, Puppet, etc...) not to mention Azure probably does support creating a VM with unmanaged disk from a VHD. But our clusters are small so it's easier for now to just do this manually.

```
# Update the machine to the latest software
sudo apt-get update
sudo apt-get upgrade

# Install latest Docker (Kubernetes lags so this is a little risky but so far it has worked)
sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Verify that the key fingerprint is 9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88
sudo apt-key fingerprint 0EBFCD88

sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"

sudo apt-get update

sudo apt-get install docker-ce

# Install kubectl
curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl

chmod +x ./kubectl

sudo mv ./kubectl /usr/local/bin/kubectl

# Shell autocompletion
echo "source <(kubectl completion bash)" >> ~/.bashrc

# Install kubeadm

sudo su -

apt-get update && apt-get install -y apt-transport-https

curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -

cat <<EOF >/etc/apt/sources.list.d/kubernetes.list
deb http://apt.kubernetes.io/ kubernetes-xenial main
EOF

apt-get update

apt-get install -y kubelet kubeadm kubernetes-cni

exit

```

### KubeAdm Config

#### /etc/systemd/system/kubelet.service.d/10-kubeadm.conf

You'll need to update /etc/systemd/system/kubelet/ to add in a line about cloud providers - as below:

`Environment="KUBELET_CLOUD_PROVIDER_ARGS=--cloud-provider=azure --cloud-config=/etc/kubernetes/cloud-config"`

And then make sure to include this new environment variable in the launch params as shown below. Be careful with just doing a copy/paste of the below in case new environment variables that kubelet requires have been added.

`ExecStart=/usr/bin/kubelet $KUBELET_KUBECONFIG_ARGS $KUBELET_SYSTEM_PODS_ARGS $KUBELET_NETWORK_ARGS $KUBELET_DNS_ARGS $KUBELET_AUTHZ_ARGS $KUBELET_EXTRA_ARGS $KUBELET_CLOUD_PROVIDER_ARGS`

#### /etc/kubernetes/cloud-config

You also need to create the /etc/kubernetes/cloud-config file. Note that you must name the file cloud-config and place it in this location. Sadly either kubeadm or kubelet are hard coded to expect this right now. A template for that file is included below. You'll need to update this to refer to your own services.

```
{
    "cloud":"AzurePublicCloud",
    "tenantId": "72f988bf-86f1-41af-91ab-2d7cd011db47",
    "subscriptionId": "f512d215-3984-4778-8938-8d73f65119f6",
    "aadClientId": "<service principal id>",
    "aadClientSecret": "<service principal password>",
    "resourceGroup": "PragueKube",
    "location": "westus2",
    "subnetName": "k8s-subnet",
    "securityGroupName": "prague-k8s-nsg",
    "vnetName": "PragueKube",
    "primaryAvailabilitySetName": "prague-k8s-agent-as"
}
```

#### kubeadm.conf
The last thing you need to create is the config file to pass to kubeadm which also specifies the use of the azure cloud provider. If you follow a default setup you likely will also want to set 

```
kind: MasterConfiguration
apiVersion: kubeadm.k8s.io/v1alpha1
cloudProvider: azure
apiServerCertSANs:
  - praguekubemgmt.westus2.cloudapp.azure.com
```

### Create Kubernetes Master

With the updates to enable the azure cloud provider in place we can now launch the master with the below command.

`sudo kubeadm init --config=kubeadm.conf`

Make note of the kubectl setup instructions. As well as the join token.

The final step is to enable a pod network. We've gone with weave since it's easy to setup and has worked well.

`kubectl apply -f https://git.io/weave-kube-1.6`

Once `kubectl get pods -n kube-system` Reports that DNS is up and running you're ready to join agents to the cluster.

### Setting up kubectl locally

You'll want to go grab the created admin.conf from the master server

`scp -i ~/.ssh/azure_kubernetes_rsa prague@praguekubemgmt.westus2.cloudapp.azure.com:/home/prague/admin.conf .`

And then update your ~/.kube/config accordingly. There probably is a way to merge config files but I haven't found it yet.

### Joining the cluster

Your Kubernetes master has initialized successfully!

To start using your cluster, you need to run (as a regular user):

  sudo cp /etc/kubernetes/admin.conf $HOME/
  sudo chown $(id -u):$(id -g) $HOME/admin.conf
  export KUBECONFIG=$HOME/admin.conf

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  http://kubernetes.io/docs/admin/addons/

You can now join any number of machines by running the following on each node
as root:

  kubeadm join --token token 10.240.0.4:6443


### Useful add-ons

Kubernetes Dashbaord

`kubectl create -f https://git.io/kube-dashboard`

Weave dashboard

`kubectl apply --namespace kube-system -f "https://cloud.weave.works/k8s/scope.yaml?k8s-version=$(kubectl version | base64 | tr -d '\n')"`

## Leaving

If you wish to leave the cluster follow the below steps.

`kubectl drain <node name> --delete-local-data --force --ignore-daemonsets`
`kubectl delete node <node name>`

Then, on the node being removed, reset all kubeadm installed state:

`kubeadm reset`


## Helm

Helm is a package manager for Kubernetes and allows for creating reusable components

You need to create the helm service account for RBAC access first. after that you can initialize it with:

`helm init --service-account helm`