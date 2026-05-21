const {Compute} = require('google-auth-library');
// eslint-disable-next-line n/no-extraneous-require
const nock = require('nock');

/**
 * Helper to sleep for a specified amount of time.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  process.env.GCE_METADATA_HOST = '169.254.169.254'; // Force gcp-metadata to use this specific host

  // Directly instantiate a Compute client.
  // By default, it uses the 'default' service account.
  const client = new Compute({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  console.log(`Client Type: ${client.constructor.name}`);

  const rabManager = client.regionalAccessBoundaryManager;
  if (!rabManager) {
    console.error('Failed to access RegionalAccessBoundaryManager');
    return;
  }

  // --- Mocking the Metadata Server ---

  // 1. Mock the token fetch so the client has a "valid" token to trigger RAB lookup.
  nock('http://169.254.169.254')
    .get(/.*/)
    .filteringPath(/.*\/token.*/, '/token')
    .reply(
      200,
      {
        access_token: 'mock-compute-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      },
      {'Metadata-Flavor': 'Google'},
    );

  // 2. Mock the identity resolution (email fetch) to FAIL with 404.
  // This is what construction of the RAB Lookup URL depends on.
  nock('http://169.254.169.254')
    .get('/computeMetadata/v1/instance/service-accounts/default/email')
    .reply(404, 'Not Found', {'Metadata-Flavor': 'Google'});

  const bucketName = 'trust_boundary_test_bucket';
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}`;

  console.log('\n--- First Call to getRequestHeaders (Cold Start) ---');
  // This will return headers with the mock token, but the background RAB URL
  // construction will fail when it hits the 404 on the email endpoint.
  const headers = await client.getRequestHeaders(url);
  console.log(
    `x-allowed-locations (First attempt): ${headers.get('x-allowed-locations') || 'NOT PRESENT (Fail Open)'}`,
  );

  console.log(
    '\nSleeping for 5 seconds to let the background identity resolution fail and enter cooldown...',
  );
  await sleep(5000);

  const cooldownTime = rabManager.regionalAccessBoundaryCooldownTime;

  if (cooldownTime > Date.now()) {
    console.log(
      `\nRAB Cooldown Time set to: ${new Date(cooldownTime).toISOString()}`,
    );
    console.log(
      'SUCCESS: Verified that failing to resolve GCE identity (email) correctly triggers the cooldown state.',
    );
  } else {
    console.log(
      `\nFAILURE: Cooldown time was not set (Current: ${cooldownTime}).`,
    );
  }

  // Clean up nock
  nock.cleanAll();
}

main().catch(console.error);
