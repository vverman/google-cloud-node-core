const {IdentityPoolClient} = require('google-auth-library');
const {Gaxios} = require('gaxios');

class OktaSupplier {
  constructor(domain, clientId, clientSecret) {
    this.tokenUrl = `${domain}/oauth2/default/v1/token`;
    this.authHeader =
      'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    this.gaxios = new Gaxios();
  }

  async getSubjectToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'access-gcp');

    const {data} = await this.gaxios.request({
      url: this.tokenUrl,
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: params.toString(),
    });

    return data.access_token;
  }
}

async function main() {

  const client = new IdentityPoolClient({
    audience:
      '//iam.googleapis.com/projects/654269145772/locations/global/workloadIdentityPools/byoid-pool/providers/aion-sdk-okta-oidc',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/byoid-test@cicpclientproj.iam.gserviceaccount.com:generateAccessToken',
    subject_token_supplier: new OktaSupplier(
      'https://integrator-9388438.okta.com',
      // IMPORTANT: Check https://valentine.corp.google.com/#/show/1772514205897767. for client id and secret
      'OKTA_CLIENT_ID',
      'OKTA_SECRET',
    ),
  });

  const res = await client.request({
    url: 'https://storage.googleapis.com/storage/v1/b/byoid-test',
  });

  console.log(JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
