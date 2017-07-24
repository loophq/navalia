#!/usr/bin/env bash

# Deploys the current version of this repository to the artifacts bucket for loop.
# Args:
#  0 - Path to Master repo.

set -e

BASE=$(dirname $0)
MASTER=`"${BASE}/loop-assert-master.sh" ${1}`

if [ -d "${BASE}/build" ]; then
  if [ "`npm view ${BASE}/build version`" == "`npm view ${BASE} version`" ]; then
    echo "Careful, you're deploying with the same version number as the version in /build"
  fi
fi
npm run build
cd build
${MASTER}/tools/javascript/upload-package-artifact.sh .
