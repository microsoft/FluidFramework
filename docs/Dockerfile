# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        nginx \
        git

#############################
# Copy the source and the api artifact
FROM base AS r11s

# Configure nginx
ADD docs/nginx.conf /etc/nginx/nginx.conf

COPY . .

#############################
FROM r11s AS docs

WORKDIR /docs
RUN npm install

#############################
FROM docs AS docpublish

EXPOSE 8080
CMD ["npm", "run", "daemon off;"]
