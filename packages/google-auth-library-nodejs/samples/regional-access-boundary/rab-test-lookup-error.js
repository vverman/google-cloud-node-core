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
  // We monkey-patch the transporter to intercept the lookup request and return a 400 Error.
  let lookupCount = 0;
  const originalRequest = client.transporter.request.bind(client.transporter);
  client.transporter.request = async opts => {
    if (opts.url && opts.url.includes('allowedLocations')) {
      lookupCount++;
      console.log(
        `\n[Mock] Intercepted RAB lookup request #${lookupCount}. Simulating 400 Bad Request...`,
      );
      const err = new Error('Mocked 400 Bad Request');
      err.response = {status: 400};
      throw err; // Fail the lookup
    }
    // Proceed with regular requests (e.g., fetching tokens or calling the actual API if we did so)
    return originalRequest(opts);
  };

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  console.log('\n--- First Call to getRequestHeaders (Cold Start) ---');
  // First call should "Fail Open" because the background lookup will fail.
  // The header should not be present.
  let headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (First attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Fail Open)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let initial background RAB lookup fail and enter cooldown...',
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
    `\nRAB Cooldown Time after initial failure: ${new Date(cooldownTime).toISOString()}`,
  );

  console.log('\n--- Manipulating Cooldown Time ---');
  // We manipulate the cooldown time to be in the past to bypass the waiting period.
  rabManager.regionalAccessBoundaryCooldownTime = Date.now() - 1000; // 1 second ago
  console.log('Manually set RAB Cooldown Time to the past to bypass cooldown.');

  console.log(
    '\n--- Second Call to getRequestHeaders (Triggers RAB Refresh after Cooldown Skip) ---',
  );
  // This call should trigger another background lookup because we skipped the cooldown.
  // It will again "Fail Open" because our mock will fail the lookup again.
  headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (Second attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Fail Open)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let the second background RAB lookup fail...',
  );
  await sleep(5000);

  const newCooldownTime = rabManager.regionalAccessBoundaryCooldownTime;
  console.log(
    `\nRAB Cooldown Time after second failure: ${new Date(newCooldownTime).toISOString()}`,
  );

  // The cooldown backoff should have increased (exponential backoff).
  const cooldownDiffMinutes = Math.round(
    (newCooldownTime - Date.now()) / 60000,
  );
  console.log(`New cooldown period is roughly ${cooldownDiffMinutes} minutes.`);

  if (lookupCount >= 2) {
    console.log(
      `\nSUCCESS: Lookup endpoint was called ${lookupCount} times, confirming refresh successfully triggered after cooldown skip.`,
    );
  } else {
    console.log(
      `\nFAILURE: Lookup endpoint was only called ${lookupCount} times.`,
    );
  }
}

main().catch(console.error);
