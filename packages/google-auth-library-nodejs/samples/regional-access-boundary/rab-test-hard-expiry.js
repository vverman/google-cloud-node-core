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

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  console.log('\n--- First Call to getRequestHeaders (Cold Start) ---');
  let headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (First attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let initial background RAB lookup finish...',
  );
  await sleep(5000);

  // Access the internal RegionalAccessBoundaryManager to inspect and manipulate state
  const rabManager = client.regionalAccessBoundaryManager;
  if (!rabManager) {
    console.error('Failed to access RegionalAccessBoundaryManager');
    return;
  }

  const expiry = rabManager.regionalAccessBoundaryExpiry;
  if (expiry === 0) {
    console.log(
      'RAB lookup might have failed or is still pending. Cannot test hard expiry.',
    );
    return;
  }

  console.log(
    `\nRAB Expiry after initial fetch: ${new Date(expiry).toISOString()}`,
  );
  console.log(
    `RAB Value after initial fetch: ${rabManager.regionalAccessBoundary.encodedLocations}`,
  );

  console.log('\n--- Manipulating Expiry for Hard Expiry Test ---');
  // We manipulate the expiry to be in the past, placing it past the hard expiry window.
  const newExpiry = Date.now() - 1000; // 1 second ago
  rabManager.regionalAccessBoundaryExpiry = newExpiry;
  console.log(
    `Manually set RAB Expiry to: ${new Date(newExpiry).toISOString()} (Past hard expiry)`,
  );

  console.log(
    '\n--- Second Call to getRequestHeaders (Triggers Hard Expiry Refresh) ---',
  );
  // This call should NOT attach the cached RAB header because it has hard-expired.
  // However, it should trigger a background refresh.
  headers = await client.getRequestHeaders(url);
  const xAllowedLocations = headers.get('x-allowed-locations');
  console.log(
    `x-allowed-locations (Second attempt): ${xAllowedLocations || 'NOT PRESENT'}`,
  );

  if (!xAllowedLocations) {
    console.log(
      'SUCCESS: x-allowed-locations is NOT attached because the RAB has hard-expired.',
    );
  } else {
    console.log(
      'FAILURE: x-allowed-locations should NOT be attached because it has hard-expired.',
    );
  }

  console.log(
    '\nSleeping for 5 seconds to let the background hard-expiry refresh finish...',
  );
  await sleep(5000);

  const refreshedExpiry = rabManager.regionalAccessBoundaryExpiry;
  console.log(
    `\nRAB Expiry after hard-expiry refresh: ${new Date(refreshedExpiry).toISOString()}`,
  );
  console.log(
    `RAB Value after hard-expiry refresh: ${rabManager.regionalAccessBoundary.encodedLocations}`,
  );

  // If the refresh succeeded, the new expiry should be ~6 hours from now, which is significantly
  // larger than the hard-expired time we manually set.
  if (refreshedExpiry > newExpiry + 5 * 60 * 60 * 1000) {
    console.log(
      '\nSUCCESS: RAB Expiry was updated significantly, confirming a proactive background refresh occurred.',
    );
  } else {
    console.log(
      '\nFAILURE: RAB Expiry was not updated as expected. Background refresh may have failed or not triggered.',
    );
  }
}

main().catch(console.error);
