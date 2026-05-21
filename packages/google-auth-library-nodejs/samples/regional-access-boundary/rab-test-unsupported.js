const {IdTokenClient} = require('google-auth-library');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';

  console.log('--- Instantiating IdTokenClient ---');

  // Create a mock provider that returns a dummy ID token
  const mockIdTokenProvider = {
    fetchIdToken: async targetAudience => {
      console.log(`Mocking ID token fetch for audience: ${targetAudience}`);
      // A dummy JWT-like structure (header.payload.signature)
      // The payload includes an 'exp' claim in the future.
      const payload = Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64');
      return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
    },
  };

  const client = new IdTokenClient({
    targetAudience: 'https://example.com',
    idTokenProvider: mockIdTokenProvider,
  });

  console.log(`Client Type: ${client.constructor.name}`);

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  try {
    console.log('\n--- First Call to getRequestHeaders ---');
    let headers = await client.getRequestHeaders(url);
    let xAllowedLocations = headers.get('x-allowed-locations');
    console.log(
      `x-allowed-locations: ${xAllowedLocations || 'NOT PRESENT (Correct behavior for ID tokens)'}`,
    );

    if (xAllowedLocations) {
      console.log('FAILURE: RAB header should NOT be present for ID tokens.');
    }

    // Waiting for a short period (e.g., 5 seconds) to demonstrate that even after
    // potential background activity, it's still not present.
    // (Note: User suggested 5 minutes, but 5-10 seconds is usually sufficient for sample verification).
    console.log('\nSleeping for 10 seconds...');
    await sleep(10000);

    console.log('--- Second Call to getRequestHeaders (after wait) ---');
    headers = await client.getRequestHeaders(url);
    xAllowedLocations = headers.get('x-allowed-locations');
    console.log(
      `x-allowed-locations: ${xAllowedLocations || 'STILL NOT PRESENT (Success)'}`,
    );

    if (xAllowedLocations) {
      console.log(
        'FAILURE: RAB header appeared after wait, which is incorrect for ID tokens.',
      );
    } else {
      console.log(
        '\nSUCCESS: Verified that RAB headers are never attached to IdTokenClient requests.',
      );
    }

    const headersObject = {};
    headers.forEach((value, key) => {
      headersObject[key] = value;
    });
    console.log('\nFull Headers Object:');
    console.log(JSON.stringify(headersObject, null, 2));
  } catch (e) {
    console.error('Error during verification:');
    console.error(e);
  }
}

main().catch(console.error);
