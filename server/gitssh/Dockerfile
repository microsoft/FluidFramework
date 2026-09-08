# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

# The alpine base image is pulled from public Docker Hub by default so local builds and external
# contributors get the canonical upstream image. Our CI pipeline overrides BASE_IMAGE_REGISTRY to
# point at our mirror ACR, because 1ES network isolation policies (CfsClean/CfsClean2) block egress
# to registry-1.docker.io from our build pool. The mirror is byte-for-byte identical to
# docker.io/library, so the same manifest digest pin resolves correctly against either registry.
# See tools/pipelines/README.md for how to maintain the mirror (upgrades, additions).
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/alpine:3.23.4@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11

# Install Git and OpenSSH so we can run a git server
RUN apk add --no-cache git
RUN apk add --no-cache openssh

# Add git shell to list of approved shells to limit user access
RUN echo $(which git-shell) >> /etc/shells

# Create a git user and group
RUN addgroup -S git
RUN adduser -D -S -s $(which git-shell) -G git git
RUN passwd -u git

# Configure ssh
RUN sed -i "s/#PermitEmptyPasswords.*/PermitEmptyPasswords\ yes/" /etc/ssh/sshd_config

# Generate ssh keys. Note this will keep them unique across builds of the container which opens things up to possible
# attacks. But the consistency also simplifies the development flow. An example script is included to generate them
# at runtime of the container. In production we would want to use a persistent volume. But since this is a dev mode
# container sticking with simplicity for now.
RUN ssh-keygen -A
# COPY entrypoint.sh /usr/local/bin/

WORKDIR /home/git

USER root

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D", "-e"]
