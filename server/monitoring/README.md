# Monitoring Job
Monitors production health via a crone job.

To build
```
docker build --build-arg NPM_TOKEN=$(echo $NPM_TOKEN) -t monitoring .
```

And to run
```
`docker run --rm -t monitoring`
```
