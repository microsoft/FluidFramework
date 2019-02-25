[![Headless Agent Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/19/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=19)

# Headless Agent
Simple script that loads Prague components with headless chrome as task runner.

To build

```
docker build --build-arg NPM_TOKEN=$(echo $NPM_TOKEN) -t headless-agent .
```

And to run
```
`docker run --rm -t --cap-add=SYS_ADMIN --network routerlicious_default headless-agent`
```
