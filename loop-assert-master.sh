#!/usr/bin/env bash

set -e

MASTER="$1"

if [ ! -d $MASTER ]; then
  echo "Not directory"
  exit 1
fi
if [ ! -f $MASTER/Master.iml ]; then
  echo "Not master"
  exit 1
fi

realpath ${MASTER}
