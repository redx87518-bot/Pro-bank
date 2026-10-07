#!/bin/sh
# Packages the OPay-style demo into OPay.zip, excluding build outputs, VCS and secret files.
cd "$(dirname "$0")/.." || exit 1
rm -f OPay.zip
zip -r OPay.zip . \
  -x "*/build/*" "build/*" ".gradle/*" ".git/*" ".idea/*" \
     "local.properties" "OPay.zip" "*.iml"
echo "Created OPay.zip"
