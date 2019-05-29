# Build Server

Install Docker Community Edition in order to run the following
<https://docs.docker.com/install/linux/docker-ce/ubuntu/#set-up-the-repository>

We make use of <https://hub.docker.com/r/microsoft/vsts-agent/> for our build server agents.

To create an agent first create a work directory for the agent that maps exactly to how it will be mounted in the
container (i.e. `/var/lib/vsts` - more on that below). This means you'll need to be running a Linux box. We make use of
[Ubuntu 16.04](https://www.ubuntu.com/download/server/thank-you?country=US&version=16.04.3&architecture=amd64) inside of
a Hyper-V VM. If setting up inside of a VM make sure to allocate enough vCPUs.

Then run the following command after getting a VSTS token:

```text
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

The work directory must match between the host and container due to how we run Docker. We provide the container access
to the host's Docker daemon by mounting the Docker socket. This is not "Docker in Docker" but does allow Docker commands
to be executed inside the container. This approach is recommended in the vsts-agent documentation. But our build
processes rely on being able to volume mount a local volume inside a running container in order to output artifacts. As
an example we run Helm and Kubernetes commands via a container. When sharing the Docker socket any volume mounts apply
to the host's file system. Not the container executing the command's file system. To work around this we mount our
VSTS_WORK directory inside the container in the same structure as on the host.

## Build Machine Help

If you have any issues setting up the build server, please write your notes down here.

## Containers can't access the internet (can't find offnet.visualstudio.com)

See <https://stackoverflow.com/questions/20430371/my-docker-container-has-no-internet>. Specifically run this:

> sudo vi /etc/NetworkManager/NetworkManager.conf
>
> // Comment out the line `dns=dnsmasq` with a `#`
>
> // restart the network manager service
>
> sudo systemctl restart network-manager
>
> cat /etc/resolv.conf


## I'm confused about downloading the agent

There is no need to download the agent. The agent is inside the container so you don't worry about it.
