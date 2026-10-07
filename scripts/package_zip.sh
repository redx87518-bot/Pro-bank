#!/bin/sh
# Packages GoldPay into GoldPay.zip, excluding build outputs, VCS and secret files.
cd "$(dirname "$0")/.." || exit 1
rm -f GoldPay.zip
zip -r GoldPay.zip . \
  -x "*/build/*" "build/*" ".gradle/*" ".git/*" ".idea/*" \
     "local.properties" "GoldPay.zip" "*.iml"
echo "Created GoldPay.zip"
