/**
 * API Discovery Script
 *
 * Probes the ABC Auctions API to discover authentication and bid endpoints.
 * Run with: npx tsx scripts/discover-api.ts
 */

const API_BASE = "https://app-api.abcauctions.co.zw";
const SITE_BASE = "https://app.abcauctions.co.zw";

const EMAIL = process.env.ABC_AUCTIONS_EMAIL ?? "mkawara@outlook.com";
const PASSWORD = process.env.ABC_AUCTIONS_PASSWORD ?? "";

// Common auth endpoint patterns
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
  // .NET / Identity Server patterns (common for Angular apps)
  { method: "POST", path: "/api/TokenAuth/Authenticate" },
  { method: "POST", path: "/api/Account/Authenticate" },
  { method: "POST", path: "/api/Auth/Authenticate" },
];

// Common body formats for login
function getLoginBodies(email: string, password: string) {
  return [
    // Standard
    { email, password },
    { Email: email, Password: password },
    { username: email, password },
    { Username: email, Password: password },
    { emailAddress: email, password },
    { EmailAddress: email, Password: password },
    // With remember me
    { email, password, rememberMe: true },
    { Email: email, Password: password, RememberMe: true },
    // OAuth-style
    { grant_type: "password", username: email, password },
  ];
}

// Bid endpoint patterns
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
  { method: "GET",  path: "/lots/bid" },
  { method: "GET",  path: "/bids" },
];

// Generic endpoint discovery
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

async function probe(method: string, path: string, body?: object, headers?: Record<string, string>): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
} | null> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": SITE_BASE,
        "Referer": `${SITE_BASE}/`,
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k] = v; });

    return {
      status: res.status,
      statusText: res.statusText,
      headers: respHeaders,
      body: text.substring(0, 2000),
    };
  } catch (err: any) {
    return null;
  }
}

async function discoverEndpoints() {
  console.log("=== DISCOVERY ENDPOINTS ===\n");
  for (const ep of DISCOVERY_ENDPOINTS) {
    const result = await probe(ep.method, ep.path);
    if (result && result.status !== 404 && result.status !== 405) {
      console.log(`✅ ${ep.method} ${ep.path} → ${result.status} ${result.statusText}`);
      if (result.body.length > 0 && result.body.length < 500) {
        console.log(`   Body: ${result.body}`);
      } else if (result.body.length >= 500) {
        console.log(`   Body (truncated): ${result.body.substring(0, 300)}...`);
      }
      console.log(`   Headers: ${JSON.stringify(result.headers, null, 2)}\n`);
    } else if (result) {
      console.log(`❌ ${ep.method} ${ep.path} → ${result.status}`);
    } else {
      console.log(`⏱️  ${ep.method} ${ep.path} → timeout/error`);
    }
  }
}

async function discoverAuth() {
  console.log("\n=== AUTH ENDPOINTS ===\n");
  const bodies = getLoginBodies(EMAIL, PASSWORD);

  for (const ep of AUTH_ENDPOINTS) {
    // Try first body format as a quick probe
    const quickProbe = await probe(ep.method, ep.path, bodies[0]);

    if (!quickProbe || quickProbe.status === 404) {
      console.log(`❌ ${ep.method} ${ep.path} → ${quickProbe?.status ?? "timeout"}`);
      continue;
    }

    // If we got something other than 404, try all body formats
    console.log(`🔍 ${ep.method} ${ep.path} → ${quickProbe.status} (trying body formats...)`);

    for (let i = 0; i < bodies.length; i++) {
      const result = await probe(ep.method, ep.path, bodies[i]);
      if (result && result.status >= 200 && result.status < 300) {
        console.log(`\n🎉 SUCCESS! ${ep.method} ${ep.path}`);
        console.log(`   Body format #${i}: ${JSON.stringify(bodies[i]).replace(PASSWORD, "***")}`);
        console.log(`   Response status: ${result.status}`);
        console.log(`   Response body: ${result.body}`);
        console.log(`   Response headers: ${JSON.stringify(result.headers, null, 2)}`);
        return { endpoint: ep, bodyFormat: i, body: bodies[i], response: result };
      } else if (result && result.status !== 404) {
        console.log(`   Format #${i}: ${result.status} - ${result.body.substring(0, 200)}`);
      }
    }
  }

  console.log("\n❌ No auth endpoint found with standard patterns");
  return null;
}

async function discoverBid(authToken?: string) {
  console.log("\n=== BID ENDPOINTS ===\n");
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  for (const ep of BID_ENDPOINTS) {
    const result = await probe(ep.method, ep.path, undefined, headers);
    if (result && result.status !== 404) {
      console.log(`🔍 ${ep.method} ${ep.path} → ${result.status} ${result.statusText}`);
      if (result.body) {
        console.log(`   Body: ${result.body.substring(0, 300)}`);
      }
    } else {
      console.log(`❌ ${ep.method} ${ep.path} → ${result?.status ?? "timeout"}`);
    }
  }
}

async function fetchAngularRoutes() {
  console.log("\n=== ANGULAR APP JS BUNDLE ANALYSIS ===\n");
  try {
    // Fetch the main page to find JS bundles
    const res = await fetch(SITE_BASE, {
      signal: AbortSignal.timeout(15_000),
      headers: { "Accept": "text/html" },
    });
    const html = await res.text();

    // Find script tags
    const scriptMatches = html.match(/src="([^"]*\.js)"/g) ?? [];
    console.log(`Found ${scriptMatches.length} JS bundles`);

    for (const match of scriptMatches) {
      const src = match.replace('src="', '').replace('"', '');
      const fullUrl = src.startsWith("http") ? src : `${SITE_BASE}/${src.replace(/^\//, '')}`;
      console.log(`\nFetching: ${fullUrl}`);

      try {
        const jsRes = await fetch(fullUrl, { signal: AbortSignal.timeout(15_000) });
        const js = await jsRes.text();

        // Search for API-related patterns
        const patterns = [
          /["']\/(?:api\/|auth\/|account\/|users\/|bids?\/|lots\/)[a-zA-Z\/\-]*["']/g,
          /["'](?:login|signin|authenticate|bid|place.?bid|token)["']/gi,
          /Authorization["']\s*[:=,]\s*["']Bearer/g,
          /["']Bearer\s/g,
          /["']x-auth-token["']/gi,
          /["']access.?token["']/gi,
          /["']refresh.?token["']/gi,
        ];

        for (const pattern of patterns) {
          const matches = js.match(pattern);
          if (matches) {
            const unique = [...new Set(matches)].slice(0, 10);
            console.log(`  Pattern ${pattern.source}: ${unique.join(", ")}`);
          }
        }
      } catch {
        console.log(`  ⏱️ Could not fetch bundle`);
      }
    }
  } catch (err: any) {
    console.log(`Error fetching Angular app: ${err.message}`);
  }
}

async function main() {
  console.log(`API Base: ${API_BASE}`);
  console.log(`Site Base: ${SITE_BASE}`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${"*".repeat(PASSWORD.length)}\n`);

  // Phase 1: General endpoint discovery
  await discoverEndpoints();

  // Phase 2: Try to find auth endpoint
  const authResult = await discoverAuth();

  // Phase 3: Extract token if auth succeeded
  let token: string | undefined;
  if (authResult?.response?.body) {
    try {
      const data = JSON.parse(authResult.response.body);
      token = data.token ?? data.accessToken ?? data.access_token ??
              data.Token ?? data.AccessToken ?? data.jwt ?? data.JWT ??
              data.result?.token ?? data.result?.accessToken ?? data.data?.token;
      if (token) {
        console.log(`\n🔑 Extracted token: ${token.substring(0, 50)}...`);
      }
    } catch {}
  }

  // Phase 4: Discover bid endpoints
  await discoverBid(token);

  // Phase 5: Try to analyze Angular bundles
  await fetchAngularRoutes();

  console.log("\n=== DONE ===");
}

main().catch(console.error);
