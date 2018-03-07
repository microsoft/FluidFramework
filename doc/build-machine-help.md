# Build Machine Help

If you have any issues setting up the build server, please write your notes down here.

## Containers can't access the internet (can't find offnet.visualstudio.com)

My (sabroner) containers couldn't access the internet. I followed this guide: https://stackoverflow.com/questions/20430371/my-docker-container-has-no-internet . Specifically run this:
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
No need to download the agent, the agent is inside the container, so don't worry about it.
