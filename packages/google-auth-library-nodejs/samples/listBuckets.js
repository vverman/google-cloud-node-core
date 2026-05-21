// Copyright 2024 Google LLC
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

const {GoogleAuth} = require('google-auth-library');

// Change this path to point to your Application Default Credentials file
const ADC_FILE_PATH =
  // '/Users/pjiyer/Documents/google-auth-adc/x509/x509_credential_config.json';
  '/Users/pjiyer/Documents/google_auth_library/NodeJS/pjiyer-cloud-node-core/google-cloud-node-core/packages/google-auth-library-nodejs/samples/okta_pluggable_config.json';

async function main() {
  const auth = new GoogleAuth({
    keyFilename: ADC_FILE_PATH,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  const projectId = await auth.getProjectId();

  console.log(`Using credentials from: ${ADC_FILE_PATH}`);
  console.log(`Project ID: ${projectId}`);

  const url = `https://storage.googleapis.com/storage/v1/b?project=${projectId}`;

  try {
    const res = await client.request({url});

    console.log('Buckets:');
    if (res.data.items) {
      res.data.items.forEach(bucket => {
        console.log(` - ${bucket.name}`);
      });
    } else {
      console.log('No buckets found.');
    }
  } catch (error) {
    console.error('Error fetching buckets.');
    console.error('Message:', error.message);
    if (error.response && error.response.data) {
      console.error(
        'API Error Details:',
        JSON.stringify(error.response.data, null, 2),
      );
    }
  }
}

main().catch(console.error);
