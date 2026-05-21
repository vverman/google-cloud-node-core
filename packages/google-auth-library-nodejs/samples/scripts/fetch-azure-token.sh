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
SSH_KEY="~/.ssh/id_rsa_azure"
VM_USER_HOST="byoidtester@172.171.113.137"
RESOURCE_URL="https://iam.googleapis.com/projects/654269145772/locations/global/workloadIdentityPools/byoid-pool/providers/azure-pid"

# The command to execute on the remote Azure VM via metadata server
REMOTE_COMMAND="curl 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=$RESOURCE_URL' -H 'Metadata:true' -s | jq -r .access_token"

# Fetch the token via SSH
# Removed -o BatchMode=yes and 2>/dev/null so it can prompt for a password
# or show the actual connection error when run manually.
TOKEN=$(ssh -i "$SSH_KEY" "$VM_USER_HOST" "$REMOTE_COMMAND")

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  # Output the error JSON expected by Pluggable Auth
  cat <<EOF
{
  "version": 1,
  "success": false,
  "code": "401",
  "message": "Failed to retrieve Azure token via SSH. Ensure SSH key is added and VM is accessible."
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
  "id_token": "$TOKEN",
  "expiration_time": $(expr $(date +%s) + 3600)
}
EOF
