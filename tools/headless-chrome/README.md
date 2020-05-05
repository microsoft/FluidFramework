[![Headless Chrome Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/19/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=19)

# Headless Chrome
Simple script that loads Fluid documents with headless chrome and then reports results

To build

```
docker build -t headless-chrome .
```

And to run
```
`docker run --rm -t --cap-add=SYS_ADMIN headless-chrome`
```
