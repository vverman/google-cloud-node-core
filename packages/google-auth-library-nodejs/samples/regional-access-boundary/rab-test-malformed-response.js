const {GoogleAuth} = require('google-auth-library');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  // Point this to a valid ADC file that supports RAB (e.g., Service Account).
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google-auth-adc/lookup-endpoint-service-account/lookup-service-account.json';

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  console.log(`Client Type: ${client.constructor.name}`);

  const rabManager = client.regionalAccessBoundaryManager;
  if (!rabManager) {
    console.error('Failed to access RegionalAccessBoundaryManager');
    return;
  }

  // --- Mocking the Transporter ---
  // We monkey-patch the transporter to intercept the lookup request and return a malformed response.
  let lookupCount = 0;
  const originalRequest = client.transporter.request.bind(client.transporter);

  client.transporter.request = async opts => {
    if (opts.url && opts.url.includes('allowedLocations')) {
      lookupCount++;
      console.log(
        `\n[Mock] Intercepted RAB lookup request #${lookupCount}. Simulating a malformed response (missing encodedLocations)...`,
      );

      // Simulate a successful HTTP response (status 200) but with a malformed payload.
      return {
        data: {
          locations: ['us-central1'],
          // intentionally omitting 'encodedLocations' to simulate a malformed response
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: opts,
      };
    }
    // Proceed with regular requests
    return originalRequest(opts);
  };

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  console.log('\n--- First Call to getRequestHeaders (Cold Start) ---');
  // First call should trigger background lookup which will fail due to the malformed response.
  // The header should not be present (Fail Open).
  const headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (First attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Fail Open)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let initial background RAB lookup fail on malformed response and enter cooldown...',
  );
  await sleep(5000);

  const cooldownTime = rabManager.regionalAccessBoundaryCooldownTime;
  if (cooldownTime === 0) {
    console.log(
      'FAILURE: Cooldown time was not set. Background lookup might not have finished or failed properly.',
    );
    return;
  }

  console.log(
    `\nRAB Cooldown Time after malformed response: ${new Date(cooldownTime).toISOString()}`,
  );
  console.log(
    'SUCCESS: Verified that a malformed response correctly triggers the cooldown state.',
  );

  if (lookupCount >= 1) {
    console.log(
      `\nSUCCESS: Lookup endpoint was called ${lookupCount} time(s).`,
    );
  } else {
    console.log('\nFAILURE: Lookup endpoint was not called.');
  }
}

main().catch(console.error);
