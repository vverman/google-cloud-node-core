const {GoogleAuth} = require('google-auth-library');

async function main() {
  process.env.GOOGLE_AUTH_TRUST_BOUNDARY_ENABLE_EXPERIMENT = 'true';
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const url = 'https://storage.googleapis.com/storage/v1/b/byoid-test';

  // Call 1 triggers background RAB lookup
  let headers = await client.getRequestHeaders(url);
  console.log(
    `Call 1 - x-allowed-locations: ${headers.get('x-allowed-locations') || 'NOT PRESENT (Expected)'}`,
  );

  // Wait for background lookup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Call 2 should have the cached RAB header
  headers = await client.getRequestHeaders(url);
  console.log(
    `Call 2 - x-allowed-locations: ${headers.get('x-allowed-locations') || 'STILL NOT PRESENT'}`,
  );

  console.log('\nMaking request...');
  try {
    const res = await client.request({url});
    console.log(`Status: ${res.status}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main().catch(console.error);
