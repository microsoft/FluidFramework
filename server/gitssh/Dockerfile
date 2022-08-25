# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

FROM alpine:3.12

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
