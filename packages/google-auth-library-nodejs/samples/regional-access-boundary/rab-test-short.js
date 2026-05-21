const {GoogleAuth} = require('google-auth-library');

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    '/Users/pjiyer/Documents/google-auth-adc/lookup-endpoint-service-account/lookup-service-account.json';

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  console.log(`Client Type: ${client.constructor.name}`);

  const url =
    'https://storage.googleapis.com/storage/v1/b/trust_boundary_test_bucket';

  // First call (triggers background RAB lookup)
  let headers = await client.getRequestHeaders(url);
  console.log(
    `\nCall 1 - x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected)'}`,
  );

  // Wait for lookup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Second call (RAB should now be cached and attached)
  headers = await client.getRequestHeaders(url);
  console.log(
    `\nCall 2 - x-allowed-locations: ${headers.get('x-allowed-locations') || 'STILL NOT PRESENT'}`,
  );
}

main().catch(console.error);
