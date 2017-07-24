#!/usr/bin/env bash

# Copies a built version into node_modules of Master so you can test your changes.
# Args:
#  0 - path to master

set -e

MASTER=`"$(dirname $0)/loop-assert-master.sh" ${1}`

echo "Build"
npm run build
echo "Remove old"
rm -rf ${MASTER}/node_modules/navalia
echo "Copy in new"
cp -r build ${MASTER}/node_modules/navalia
echo "Done"

