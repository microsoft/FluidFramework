FROM golang:1.10.2-alpine

RUN apk add --no-cache bash

WORKDIR /go/src/lfs-server
COPY . .

RUN go get -d -v ./...
RUN go install -v ./...
RUN go build

CMD ["bash", "run.sh"]