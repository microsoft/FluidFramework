#!/usr/bin/env bash
# Display welcome notice in every interactive terminal session.
# Sourced from /etc/profile.d, /etc/bash/bashrc.d, or /etc/zsh/zshrc.d.

# Only display in interactive shells
case $- in
  *i*) ;;
  *) return 0 ;;
esac

if [ -f /usr/local/etc/fluid-welcome-notice.txt ]; then
  cat /usr/local/etc/fluid-welcome-notice.txt
fi
