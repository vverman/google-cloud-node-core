const {GoogleAuth} = require('google-auth-library');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  // Point this to the relevant ADC file for testing.
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google_auth_library/NodeJS/pjiyer-cloud-node-core/google-cloud-node-core/packages/google-auth-library-nodejs/samples/azure_pluggable_config.json'; // <------- Azure Pluggable Auth Service Account.

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  console.log(`Client Type: ${client.constructor.name}`);
  console.log(`Universe Domain: ${client.universeDomain}`);
  console.log(
    `Has getRegionalAccessBoundaryUrl: ${typeof client.getRegionalAccessBoundaryUrl}`,
  );
  if (typeof client.getRegionalAccessBoundaryUrl === 'function') {
    try {
      console.log(`RAB URL: ${await client.getRegionalAccessBoundaryUrl()}`);
    } catch (e) {
      console.log(`RAB URL Error: ${e.message}`);
    }
  }

  // Replace with name of a bucket that your account has access to
  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  try {
    console.log('--- First Call to getRequestHeaders ---');
    let headers = await client.getRequestHeaders(url);
    console.log('Headers (First attempt):');
    console.log(
      `x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected for cold start in default universe)'}`,
    );

    console.log(
      '\nSleeping for 5 seconds to let background RAB lookup finish...',
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
      console.log('Success! RAB header is present for the default universe.');
    } else {
      console.log(
        'Failure! RAB header should be present for the default universe.',
      );
    }

    const headersObject = {};
    headers.forEach((value, key) => {
      headersObject[key] = value;
    });
    console.log('\nFull Headers Object:');
    console.log(JSON.stringify(headersObject, null, 2));
  } catch (e) {
    console.error('Error fetching request headers:');
    console.error(e);
  }
}

main().catch(console.error);
