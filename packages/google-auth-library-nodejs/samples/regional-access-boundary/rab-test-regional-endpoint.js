const {GoogleAuth} = require('google-auth-library');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  // Point this to the relevant ADC file for testing.
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google-auth-adc/lookup-endpoint-service-account/lookup-service-account.json'; // <------- Service Account.

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

  // Replace with a regional endpoint url
  const url =
    'https://us-east1.rep.googleapis.com/v1/projects/my-project/locations/us-east1';

  try {
    console.log('--- First Call to getRequestHeaders ---');
    let headers = await client.getRequestHeaders(url);
    console.log('Headers (First attempt):');
    console.log(
      `x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected because endpoint is regional)'}`,
    );

    console.log(
      'Sleeping for 2 seconds to see if background RAB lookup happens (it shouldnt)...',
    );
    await sleep(2000);

    console.log('--- Second Call to getRequestHeaders ---');
    headers = await client.getRequestHeaders(url);
    console.log('Headers (Second attempt):');
    const xAllowedLocations = headers.get('x-allowed-locations');
    console.log(
      `x-allowed-locations: ${xAllowedLocations || 'STILL NOT PRESENT (Expected because endpoint is regional)'}`,
    );

    if (xAllowedLocations) {
      console.log(
        'UNEXPECTED! RAB header should not be present for a regional endpoint.',
      );
    } else {
      console.log(
        'Success! RAB header was properly skipped for the regional endpoint.',
      );
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

main().catch(console.error);
