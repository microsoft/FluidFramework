FROM node:7.7.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server

# Install python library and dependencies
RUN apk add --update python py-pip
RUN pip install -r dependencies.txt

EXPOSE 8080

CMD ["python", "text-analytics/server.py"]