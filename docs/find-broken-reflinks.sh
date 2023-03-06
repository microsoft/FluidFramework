code=$($RG_PATH -e \\[[\\w\\s]+\\]\\[.*?\\] ./public --type=html)
echo $code
if [ "$code" = "1" ]; then
  echo "No broken reference links found"
  exit 0
fi
