const {GoogleAuth} = require('google-auth-library');
const {Gaxios} = require('gaxios');

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  // Point this to the same ADC file used in your other tests.
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google-auth-adc/lookup-endpoint-service-account/lookup-service-account.json';

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  console.log(`Client Type: ${client.constructor.name}`);

  try {
    console.log('\n--- Step 1: Fetching Authorization Header ---');
    const urlForHeader = 'https://pubsub.example.com';
    const headersRes = await client.getRequestHeaders(urlForHeader);
    const authHeader = headersRes.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error(
        `Failed to get Bearer token from getRequestHeaders. Header: ${authHeader}`,
      );
    }

    const token = authHeader.substring(7);
    console.log(
      `Token retrieved (first 10 chars): ${token.substring(0, 10)}...`,
    );

    console.log('\n--- Step 2: Constructing Lookup URL ---');
    let email = client.email || client.targetPrincipal;

    // If it's a standard JWT client, we might need to resolve it
    if (!email && typeof client.getCredentials === 'function') {
      const creds = await client.getCredentials();
      email = creds.client_email;
    }

    if (!email) {
      throw new Error('Could not determine service account email from client.');
    }

    const universe = client.universeDomain || 'googleapis.com';
    const lookupUrl = `https://staging-iamcredentials.sandbox.${universe}/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}/allowedLocations`;
    console.log(`Lookup URL: ${lookupUrl}`);

    console.log('\n--- Step 3: Making Manual Lookup Request ---');
    const transporter = new Gaxios();

    // Attempt to find a quota project ID
    let quotaProject = process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    if (!quotaProject && client.quotaProjectId) {
      quotaProject = client.quotaProjectId;
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    /*
    if (quotaProject) {
      console.log(`Using Quota Project: ${quotaProject}`);
      headers['x-goog-user-project'] = quotaProject;
    }
    */

    const res = await transporter.request({
      url: lookupUrl,
      method: 'GET',
      headers,
      // Force no retry to see the immediate error
      retry: false,
    });

    console.log('Success! RAB Data:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('\n--- Error Encountered ---');
    if (e.response) {
      console.error(`Status: ${e.response.status}`);
      console.error('Response Data:');
      console.error(JSON.stringify(e.response.data, null, 2));
      console.error('\nResponse Headers:');
      const headers = {};
      e.response.headers.forEach((v, k) => (headers[k] = v));
      console.error(JSON.stringify(headers, null, 2));
    } else {
      console.error(e.message);
    }
  }
}

main().catch(console.error);
