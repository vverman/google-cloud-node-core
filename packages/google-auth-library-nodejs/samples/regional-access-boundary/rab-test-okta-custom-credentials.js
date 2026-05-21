// Copyright 2025 Google LLC
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const {IdentityPoolClient} = require('google-auth-library');
const {Gaxios} = require('gaxios');
require('dotenv').config();

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Workload Identity Pool Configuration
const gcpWorkloadAudience = process.env.GCP_WORKLOAD_AUDIENCE;
const serviceAccountImpersonationUrl =
  process.env.GCP_SERVICE_ACCOUNT_IMPERSONATION_URL;
const gcsBucketName =
  process.env.GCS_BUCKET_NAME || 'trust_boundary_test_bucket';

// Okta Configuration
const oktaDomain = process.env.OKTA_DOMAIN; // e.g., 'https://dev-12345.okta.com'
const oktaClientId = process.env.OKTA_CLIENT_ID; // The Client ID of your Okta M2M application
const oktaClientSecret = process.env.OKTA_CLIENT_SECRET; // The Client Secret of your Okta M2M application

// Constants for the authentication flow
const TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';

/**
 * A custom SubjectTokenSupplier that authenticates with Okta using the
 * Client Credentials grant flow.
 */
class OktaClientCredentialsSupplier {
  constructor(domain, clientId, clientSecret) {
    this.oktaTokenUrl = domain.startsWith('http')
      ? `${domain}/oauth2/default/v1/token`
      : `https://${domain}/oauth2/default/v1/token`;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.expiryTime = 0;
    this.gaxios = new Gaxios();
    console.log(
      `OktaClientCredentialsSupplier initialized for domain: ${this.oktaTokenUrl}`,
    );
  }

  async getSubjectToken() {
    const isTokenValid =
      this.accessToken && Date.now() < this.expiryTime - 60 * 1000;

    if (isTokenValid) {
      console.log('[Supplier] Returning cached Okta Access token.');
      return this.accessToken;
    }

    console.log(
      '[Supplier] Token is missing or expired. Fetching new Okta Access token via Client Credentials grant...',
    );
    const {accessToken, expiresIn} = await this.fetchOktaAccessToken();
    this.accessToken = accessToken;
    this.expiryTime = Date.now() + expiresIn * 1000;
    return this.accessToken;
  }

  async fetchOktaAccessToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'access-gcp');

    const authHeader =
      'Basic ' +
      Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await this.gaxios.request({
        url: this.oktaTokenUrl,
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: params.toString(),
      });

      const {access_token, expires_in} = response.data;

      if (access_token && expires_in) {
        console.log(
          `[Supplier] Successfully received Access Token from Okta. Expires in ${expires_in} seconds.`,
        );
        return {accessToken: access_token, expiresIn: expires_in};
      } else {
        throw new Error(
          'Access token or expires_in not found in Okta response.',
        );
      }
    } catch (error) {
      console.error(
        '[Supplier] Error fetching token from Okta:',
        error.response?.data || error.message,
      );
      throw new Error(
        'Failed to authenticate with Okta using Client Credentials grant.',
      );
    }
  }
}

/**
 * Main function to demonstrate the custom supplier with RAB logic.
 */
async function main() {
  // Enable the Trust Boundary experiment
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';

  if (
    !gcpWorkloadAudience ||
    !oktaDomain ||
    !oktaClientId ||
    !oktaClientSecret
  ) {
    throw new Error(
      'Missing required environment variables (GCP_WORKLOAD_AUDIENCE, OKTA_DOMAIN, OKTA_CLIENT_ID, OKTA_CLIENT_SECRET).',
    );
  }

  // 1. Instantiate our custom supplier with Okta credentials.
  const oktaSupplier = new OktaClientCredentialsSupplier(
    oktaDomain,
    oktaClientId,
    oktaClientSecret,
  );

  // 2. Instantiate an IdentityPoolClient directly.
  const client = new IdentityPoolClient({
    audience: gcpWorkloadAudience,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: TOKEN_URL,
    subject_token_supplier: oktaSupplier,
    service_account_impersonation_url: serviceAccountImpersonationUrl,
  });

  console.log(`Client Type: ${client.constructor.name}`);
  console.log(`Universe Domain: ${client.universeDomain}`);

  if (typeof client.getRegionalAccessBoundaryUrl === 'function') {
    try {
      console.log(`RAB URL: ${await client.getRegionalAccessBoundaryUrl()}`);
    } catch (e) {
      console.log(`RAB URL Error: ${e.message}`);
    }
  }

  // 3. Construct the URL for the request (e.g. Cloud Storage).
  const url = `https://storage.googleapis.com/storage/v1/b/${gcsBucketName}`;

  try {
    console.log('--- First Call to getRequestHeaders ---');
    let headers = await client.getRequestHeaders(url);
    console.log('Headers (First attempt):');
    console.log(
      `x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected for cold start)'}`,
    );

    console.log(
      'Sleeping for 5 seconds to let background RAB lookup finish...',
    );
    await sleep(5000);

    console.log('--- Second Call to getRequestHeaders ---');
    headers = await client.getRequestHeaders(url);
    console.log('Headers (Second attempt):');
    const xAllowedLocations = headers.get('x-allowed-locations');
    console.log(
      `x-allowed-locations: ${xAllowedLocations || 'STILL NOT PRESENT (Lookup might have failed)'}`,
    );

    if (xAllowedLocations) {
      console.log('Success! RAB header is present.');
    } else {
      console.log('Failure! RAB header should be present.');
    }

    const headersObject = {};
    headers.forEach((value, key) => {
      headersObject[key] = value;
    });
    console.log('Full Headers Object:');
    console.log(JSON.stringify(headersObject, null, 2));
  } catch (e) {
    console.error('Error fetching request headers:');
    console.error(e);
  }
}

main().catch(error => {
  console.error('--- FAILED ---');
  const fullError = error.response?.data || error.message || error;
  console.error(JSON.stringify(fullError, null, 2));
  process.exitCode = 1;
});
