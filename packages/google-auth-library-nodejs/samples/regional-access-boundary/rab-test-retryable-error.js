const {GoogleAuth} = require('google-auth-library');
// eslint-disable-next-line n/no-extraneous-require
const nock = require('nock');

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

  // --- Mocking the Network for Retryable Errors ---
  // We use nock to intercept network requests at the HTTP level, allowing gaxios
  // to run its retry logic normally.

  let lookupAttemptCount = 0;

  const scope = nock('https://staging-iamcredentials.sandbox.googleapis.com')
    // Match any request to the allowedLocations endpoint
    .get(/.*/)
    .times(2)
    .reply((uri, requestBody, cb) => {
      lookupAttemptCount++;
      console.log(
        `\n[Mock] Intercepted RAB lookup attempt #${lookupAttemptCount} to ${uri}. Simulating 503 Service Unavailable...`,
      );
      cb(null, [503, 'Service Unavailable']);
    })
    .get(/.*/)
    .reply((uri, requestBody, cb) => {
      lookupAttemptCount++;
      console.log(
        `\n[Mock] Intercepted RAB lookup attempt #${lookupAttemptCount} to ${uri}. Allowing request to proceed successfully...`,
      );
      cb(null, [
        200,
        {
          locations: ['us-central1'],
          encodedLocations: 'mocked-encoded-locations-after-retries',
        },
      ]);
    });

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  console.log('\n--- Call to getRequestHeaders (Cold Start) ---');
  // This call will return immediately without the RAB header (Fail Open).
  // However, in the background, it will trigger the lookup.
  // The underlying library (gaxios) will automatically retry the 503 errors
  // before eventually succeeding on the 3rd try.
  let headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (First attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Fail Open)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let the background retries and eventual success complete...',
  );
  // It might take a moment because gaxios uses exponential backoff for retries.
  await sleep(5000);

  // Let's check if the RAB was successfully cached after the retries.
  const cachedRab = rabManager.regionalAccessBoundary;

  if (
    cachedRab &&
    cachedRab.encodedLocations === 'mocked-encoded-locations-after-retries'
  ) {
    console.log(
      `\nSUCCESS: RAB was successfully fetched and cached after retries: ${cachedRab.encodedLocations}`,
    );
  } else {
    console.log(
      '\nFAILURE: RAB was not cached. Retries might have failed or not occurred.',
    );
  }

  if (lookupAttemptCount >= 3) {
    console.log(
      `\nSUCCESS: The lookup endpoint was called ${lookupAttemptCount} times, confirming that retry logic for 5xx errors works.`,
    );
  } else {
    console.log(
      `\nFAILURE: The lookup endpoint was only called ${lookupAttemptCount} times. Expected at least 3 attempts.`,
    );
  }

  // To be absolutely sure, let's do a final call to getRequestHeaders.
  // It should now attach the cached RAB.
  console.log(
    '\n--- Final Call to getRequestHeaders (Verify Header Attachment) ---',
  );
  headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (Final attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT'}`,
  );

  if (
    headers.get('x-allowed-locations') ===
    'mocked-encoded-locations-after-retries'
  ) {
    console.log(
      'SUCCESS: x-allowed-locations header is now correctly attached to the request.',
    );
  } else {
    console.log('FAILURE: x-allowed-locations header is missing or incorrect.');
  }

  // Clean up nock
  nock.cleanAll();
}

main().catch(console.error);
