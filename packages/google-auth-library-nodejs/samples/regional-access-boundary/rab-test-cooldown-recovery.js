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
  // We monkey-patch the transporter to intercept the lookup request.
  let lookupCount = 0;
  let mockShouldFail = true; // Control whether the mock fails or succeeds
  const originalRequest = client.transporter.request.bind(client.transporter);

  client.transporter.request = async opts => {
    if (opts.url && opts.url.includes('allowedLocations')) {
      lookupCount++;
      if (mockShouldFail) {
        console.log(
          `\n[Mock] Intercepted RAB lookup request #${lookupCount}. Simulating 400 Bad Request...`,
        );
        const err = new Error('Mocked 400 Bad Request');
        err.response = {status: 400};
        throw err; // Fail the lookup
      } else {
        console.log(
          `\n[Mock] Intercepted RAB lookup request #${lookupCount}. Allowing request to proceed successfully...`,
        );
      }
    }
    // Proceed with regular requests
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

  console.log('\n--- Manipulating Cooldown Time & Disabling Mock Failure ---');
  // We manipulate the cooldown time to be in the past to bypass the waiting period.
  rabManager.regionalAccessBoundaryCooldownTime = Date.now() - 1000; // 1 second ago
  console.log('Manually set RAB Cooldown Time to the past to bypass cooldown.');
  mockShouldFail = false; // Allow the next lookup to succeed
  console.log(
    'Disabled mock failure. The next lookup will hit the actual endpoint.',
  );

  console.log(
    '\n--- Second Call to getRequestHeaders (Triggers Successful RAB Refresh) ---',
  );
  // This call triggers another background lookup because we bypassed the cooldown.
  // Because we disabled the mock failure, it should succeed.
  headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (Second attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Still Fail Open during background fetch)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let the successful background RAB lookup finish...',
  );
  await sleep(5000);

  const finalCooldownTime = rabManager.regionalAccessBoundaryCooldownTime;
  console.log(
    `\nRAB Cooldown Time after success: ${finalCooldownTime === 0 ? '0 (Reset)' : finalCooldownTime}`,
  );

  if (
    rabManager.regionalAccessBoundary &&
    rabManager.regionalAccessBoundary.encodedLocations
  ) {
    console.log(
      `\nSUCCESS: RAB Value successfully fetched and cached: ${rabManager.regionalAccessBoundary.encodedLocations}`,
    );
  } else {
    console.log(
      '\nFAILURE: RAB Value was not successfully fetched and cached.',
    );
  }

  console.log(
    '\n--- Third Call to getRequestHeaders (Verifies Header Attachment) ---',
  );
  // Now that the cache is populated, this call should successfully attach the header.
  headers = await client.getRequestHeaders(url);
  const finalXAllowedLocations = headers.get('x-allowed-locations');
  console.log(
    `x-allowed-locations (Third attempt): ${finalXAllowedLocations || 'NOT PRESENT'}`,
  );

  if (finalXAllowedLocations) {
    console.log(
      'SUCCESS: x-allowed-locations header is now attached to the request.',
    );
  } else {
    console.log(
      'FAILURE: x-allowed-locations header should be attached to the request.',
    );
  }
}

main().catch(console.error);
