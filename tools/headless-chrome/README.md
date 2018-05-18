Simple script that loads Prague documents with headless chrome and then reports results

docker build -t headless .
docker run --rm -t --cap-add=SYS_ADMIN headless
