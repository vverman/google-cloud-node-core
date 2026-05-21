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
OKTA_DOMAIN="integrator-9388438.okta.com"
#IMPORTANT: Check https://valentine.corp.google.com/#/show/1772514205897767. for client id and secret
OKTA_CLIENT_ID="OKTA_CLIENT_ID"
OKTA_CLIENT_SECRET="OKTA_SECRET"

# Okta's token endpoint (using the default custom authorization server)
TOKEN_URL="https://${OKTA_DOMAIN}/oauth2/default/v1/token"

# Fetch the token from Okta using Client Credentials
# Note: For GCP federation, Okta returns an Access Token that is a valid JWT, 
# which GCP accepts as an OIDC token.
RESPONSE=$(curl -s -X POST "${TOKEN_URL}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${OKTA_CLIENT_ID}" \
  -d "client_secret=${OKTA_CLIENT_SECRET}" \
  -d "scope=access-gcp")

# Extract the access_token (JWT) from the Okta response
TOKEN=$(echo "$RESPONSE" | jq -r .access_token)

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  cat <<EOF
{
  "version": 1,
  "success": false,
  "code": "401",
  "message": "Failed to retrieve Okta token. Response: $RESPONSE"
}
EOF
  exit 1
fi

# Output the success JSON expected by GCP Pluggable Auth
cat <<EOF
{
  "version": 1,
  "success": true,
  "token_type": "urn:ietf:params:oauth:token-type:jwt",
  "id_token": "$TOKEN",
  "expiration_time": $(expr $(date +%s) + 3600)
}
EOF
