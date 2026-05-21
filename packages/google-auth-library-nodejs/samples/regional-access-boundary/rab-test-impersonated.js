const {GoogleAuth} = require('google-auth-library');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  // Point this to the relevant ADC file for testing.
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google-auth-adc/lookup-endpoint-service-account/impersonated.json'; // <------- Impersonated Service Account.

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  console.log(`Client Type: ${client.constructor.name}`);
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
  const bucketName = 'byoid-test';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  try {
    console.log('--- First Call to getRequestHeaders ---');
    let headers = await client.getRequestHeaders(url);
    console.log('Headers (First attempt):');
    console.log(
      `x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected for cold start)'}`,
    );

    console.log(
      '\nSleeping for 5 seconds to let background RAB lookup finish...',
    );
    await sleep(5000);

    console.log('--- Second Call to getRequestHeaders ---');
    headers = await client.getRequestHeaders(url);
    console.log('Headers (Second attempt):');
    console.log(
      `x-allowed-locations: ${headers.get('x-allowed-locations') || 'STILL NOT PRESENT (Lookup might have failed or timed out)'}`,
    );

    if (headers.get('x-allowed-locations')) {
      console.log('Success! RAB header is now present.');
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

  console.log(`\nAttempting to request info for bucket: ${bucketName}`);
  console.log(`Request URL: ${url}`);

  try {
    const res = await client.request({url});
    console.log('Success! Bucket Data:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('Error fetching bucket data:');
    console.error(e);
  }
}

main().catch(console.error);
