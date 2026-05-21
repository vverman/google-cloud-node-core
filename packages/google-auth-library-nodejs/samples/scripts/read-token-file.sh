#!/bin/bash
# Copyright 2024 Google LLC
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Configuration
TOKEN_FILE="azure_subject_token.txt"

# Check if the token file exists
if [ ! -f "$TOKEN_FILE" ]; then
  cat <<EOF
{
  "version": 1,
  "success": false,
  "code": "404",
  "message": "Token file not found: $TOKEN_FILE"
}
EOF
  exit 1
fi

# Read the token from the file (trimming any whitespace/newlines)
TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')

if [ -z "$TOKEN" ]; then
  cat <<EOF
{
  "version": 1,
  "success": false,
  "code": "400",
  "message": "Token file is empty: $TOKEN_FILE"
}
EOF
  exit 1
fi

# Output the success JSON expected by Pluggable Auth
cat <<EOF
{
  "version": 1,
  "success": true,
  "token_type": "urn:ietf:params:oauth:token-type:jwt",
  "id_token": "$TOKEN"
}
EOF
