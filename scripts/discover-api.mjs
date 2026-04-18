/**
 * API Discovery Script (plain Node.js)
 * Run with: node scripts/discover-api.mjs
 */

const API_BASE = "https://app-api.abcauctions.co.zw";
const SITE_BASE = "https://app.abcauctions.co.zw";
const EMAIL = process.env.ABC_AUCTIONS_EMAIL ?? "mkawara@outlook.com";
const PASSWORD = process.env.ABC_AUCTIONS_PASSWORD ?? ".C2vAW9uPpUTcsW";

const AUTH_ENDPOINTS = [
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/signin" },
  { method: "POST", path: "/auth/authenticate" },
  { method: "POST", path: "/account/login" },
  { method: "POST", path: "/account/signin" },
  { method: "POST", path: "/account/authenticate" },
  { method: "POST", path: "/users/login" },
  { method: "POST", path: "/users/signin" },
  { method: "POST", path: "/users/authenticate" },
  { method: "POST", path: "/login" },
  { method: "POST", path: "/signin" },
  { method: "POST", path: "/authenticate" },
  { method: "POST", path: "/api/login" },
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/api/account/login" },
  { method: "POST", path: "/token" },
  { method: "POST", path: "/oauth/token" },
  { method: "POST", path: "/connect/token" },
  { method: "POST", path: "/api/TokenAuth/Authenticate" },
  { method: "POST", path: "/api/Account/Authenticate" },
];

function getLoginBodies(email, password) {
  return [
    { email, password },
    { Email: email, Password: password },
    { username: email, password },
    { Username: email, Password: password },
    { emailAddress: email, password },
    { EmailAddress: email, Password: password },
    { email, password, rememberMe: true },
    { Email: email, Password: password, RememberMe: true },
    { grant_type: "password", username: email, password },
  ];
}

const BID_ENDPOINTS = [
  { method: "POST", path: "/lots/bid" },
  { method: "POST", path: "/lots/placebid" },
  { method: "POST", path: "/lots/place-bid" },
  { method: "POST", path: "/bids" },
  { method: "POST", path: "/bids/place" },
  { method: "POST", path: "/bid" },
  { method: "POST", path: "/bid/place" },
  { method: "POST", path: "/api/bid" },
  { method: "POST", path: "/api/bids" },
  { method: "POST", path: "/api/lots/bid" },
  { method: "GET", path: "/lots/bid" },
  { method: "GET", path: "/bids" },
];

const DISCOVERY_ENDPOINTS = [
  { method: "GET", path: "/swagger/v1/swagger.json" },
  { method: "GET", path: "/swagger.json" },
  { method: "GET", path: "/api-docs" },
  { method: "GET", path: "/openapi.json" },
  { method: "GET", path: "/.well-known/openid-configuration" },
  { method: "GET", path: "/api" },
  { method: "GET", path: "/api/v1" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/status" },
  { method: "GET", path: "/account/me" },
  { method: "GET", path: "/users/me" },
  { method: "GET", path: "/auth/me" },
  { method: "GET", path: "/profile" },
  { method: "GET", path: "/account" },
];

async function probe(method, path, body, headers) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: SITE_BASE,
        Referer: `${SITE_BASE}/`,
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    const respHeaders = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    return {
      status: res.status,
      statusText: res.statusText,
      headers: respHeaders,
      body: text.substring(0, 2000),
    };
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log(`API Base: ${API_BASE}`);
  console.log(`Email: ${EMAIL}\n`);

  // Phase 1: General discovery
  console.log("=== DISCOVERY ENDPOINTS ===\n");
  for (const ep of DISCOVERY_ENDPOINTS) {
    const r = await probe(ep.method, ep.path);
    if (r && r.status !== 404 && r.status !== 405) {
      console.log(`✅ ${ep.method} ${ep.path} → ${r.status} ${r.statusText}`);
      if (r.body.length > 0 && r.body.length < 500) console.log(`   Body: ${r.body}`);
      else if (r.body.length >= 500)
        console.log(`   Body (truncated): ${r.body.substring(0, 300)}...`);
    } else {
      console.log(`❌ ${ep.method} ${ep.path} → ${r?.status ?? "timeout"}`);
    }
  }

  // Phase 2: Auth
  console.log("\n=== AUTH ENDPOINTS ===\n");
  const bodies = getLoginBodies(EMAIL, PASSWORD);
  let authToken = null;

  for (const ep of AUTH_ENDPOINTS) {
    const quick = await probe(ep.method, ep.path, bodies[0]);
    if (!quick || quick.status === 404) {
      console.log(`❌ ${ep.method} ${ep.path} → ${quick?.status ?? "timeout"}`);
      continue;
    }
    console.log(`🔍 ${ep.method} ${ep.path} → ${quick.status} (trying body formats...)`);

    for (let i = 0; i < bodies.length; i++) {
      const r = await probe(ep.method, ep.path, bodies[i]);
      if (r && r.status >= 200 && r.status < 300) {
        console.log(`\n🎉 SUCCESS! ${ep.method} ${ep.path}`);
        console.log(`   Body format #${i}: ${JSON.stringify(Object.keys(bodies[i]))}`);
        console.log(`   Response: ${r.body}`);
        try {
          const data = JSON.parse(r.body);
          authToken =
            data.token ??
            data.accessToken ??
            data.access_token ??
            data.Token ??
            data.AccessToken ??
            data.jwt ??
            data.result?.token ??
            data.result?.accessToken ??
            data.data?.token;
          if (authToken) console.log(`\n🔑 Token: ${authToken.substring(0, 80)}...`);
        } catch {}
        break;
      } else if (r && r.status !== 404) {
        console.log(`   #${i}: ${r.status} - ${r.body.substring(0, 200)}`);
      }
    }
    if (authToken) break;
  }

  // Phase 3: Bid endpoints
  console.log("\n=== BID ENDPOINTS ===\n");
  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  for (const ep of BID_ENDPOINTS) {
    const r = await probe(ep.method, ep.path, undefined, authHeaders);
    if (r && r.status !== 404) {
      console.log(`🔍 ${ep.method} ${ep.path} → ${r.status} ${r.statusText}`);
      if (r.body) console.log(`   Body: ${r.body.substring(0, 300)}`);
    } else {
      console.log(`❌ ${ep.method} ${ep.path} → ${r?.status ?? "timeout"}`);
    }
  }

  // Phase 4: Angular bundle analysis
  console.log("\n=== ANGULAR JS BUNDLE ANALYSIS ===\n");
  try {
    const res = await fetch(SITE_BASE, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "text/html" },
    });
    const html = await res.text();
    const scriptMatches = html.match(/src="([^"]*\.js)"/g) ?? [];
    console.log(`Found ${scriptMatches.length} JS bundles`);

    for (const match of scriptMatches) {
      const src = match.replace('src="', "").replace('"', "");
      const fullUrl = src.startsWith("http") ? src : `${SITE_BASE}/${src.replace(/^\//, "")}`;
      console.log(`\nFetching: ${fullUrl}`);
      try {
        const jsRes = await fetch(fullUrl, { signal: AbortSignal.timeout(15000) });
        const js = await jsRes.text();
        const patterns = [
          {
            name: "API paths",
            re: /["']\/(?:api\/|auth\/|account\/|users\/|bids?\/|lots\/)[a-zA-Z\/\-]*["']/g,
          },
          {
            name: "Auth keywords",
            re: /["'](?:login|signin|authenticate|bid|place.?bid|token)["']/gi,
          },
          { name: "Bearer", re: /Authorization["']\s*[:=,]\s*["']Bearer/g },
          {
            name: "Token refs",
            re: /["'](?:access.?[Tt]oken|refresh.?[Tt]oken|auth.?[Tt]oken|[Bb]earer)["']/g,
          },
        ];
        for (const { name, re } of patterns) {
          const matches = js.match(re);
          if (matches) {
            const unique = [...new Set(matches)].slice(0, 15);
            console.log(`  ${name}: ${unique.join(", ")}`);
          }
        }
      } catch {
        console.log(`  ⏱️ Could not fetch`);
      }
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
