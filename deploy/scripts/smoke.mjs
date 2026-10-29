// End-to-end smoke test against the running local stack (services directly, no gateway needed).
// Usage: node deploy/scripts/smoke.mjs   (reads the OTP from deploy/local/identity-service.log)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const logFile = join(here, "..", "local", "identity-service.log");
const ID = "http://127.0.0.1:8081", CAT = "http://127.0.0.1:8082", ORD = "http://127.0.0.1:8083", PAY = "http://127.0.0.1:8084";
const phone = "+91" + String(9000000000 + Math.floor(Math.random() * 99999999));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log("- " + m);

async function call(url, { method = "GET", body, token, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

step(`request OTP for ${phone}`);
await call(`${ID}/auth/otp/request`, { method: "POST", body: { phone } });
await sleep(500);
const lines = readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => l.includes(`OTP for ${phone}`));
const code = lines.at(-1)?.match(/is (\d+)/)?.[1];
if (!code) throw new Error("OTP not found in identity-service.log");

step("verify OTP");
const tokens = await call(`${ID}/auth/otp/verify`, {
  method: "POST",
  body: { phone, code, name: "Smoke Guest", consent: { purpose: "TERMS_AND_PRIVACY", version: "1", granted: true } },
});
const token = tokens.accessToken;
const me = await call(`${ID}/me`, { token });
if (me.name !== "Smoke Guest" || me.hasPassword) throw new Error("guest profile unexpected: " + JSON.stringify(me));

step("register with email, verify through the emailed link, then log in");
const email = `smoke${Date.now()}@example.com`;
const consent = { purpose: "TERMS_AND_PRIVACY", version: "1", granted: true };
const status = async (fn) => { try { await fn(); return 200; } catch (e) { return Number(e.message.match(/-> (\d{3})/)?.[1] ?? 0); } };
const mailToken = (kind) => {
  const l = readFileSync(logFile, "utf8").split(/\r?\n/).filter((x) => x.includes(`${kind} to ${email}`));
  const t = l.at(-1)?.match(/token=([\w-]+)/)?.[1];
  if (!t) throw new Error(`${kind} email link not found in identity-service.log`);
  return t;
};
await call(`${ID}/auth/register`, { method: "POST", body: { name: "Smoke Email", email, password: "Sm0keTest99", consent } });
await sleep(300);
if (await status(() => call(`${ID}/auth/login`, { method: "POST", body: { email, password: "Sm0keTest99" } })) !== 403)
  throw new Error("login before verification should be 403");
await call(`${ID}/auth/email/verify`, { method: "POST", body: { token: mailToken("VERIFY_EMAIL"), password: "Sm0keTest99" } });
await call(`${ID}/auth/login`, { method: "POST", body: { email, password: "Sm0keTest99" } });
if (await status(() => call(`${ID}/auth/login`, { method: "POST", body: { email, password: "wrong-pass1" } })) !== 401)
  throw new Error("wrong password was not rejected with 401");

step("forgot and reset password");
await call(`${ID}/auth/password/forgot`, { method: "POST", body: { email } });
await sleep(300);
await call(`${ID}/auth/password/reset`, { method: "POST", body: { token: mailToken("RESET_PASSWORD"), password: "Sm0keTest100" } });
await call(`${ID}/auth/login`, { method: "POST", body: { email, password: "Sm0keTest100" } });
step("search restaurants near Bengaluru");
const restaurants = await call(`${CAT}/restaurants?lat=12.9716&lng=77.5946&radiusMeters=5000`);
if (!restaurants.length) throw new Error("no restaurants returned");
const r = restaurants[0];
if (!restaurants.some((x) => x.cuisine)) throw new Error("no restaurant has a cuisine");
const menu = await call(`${CAT}/restaurants/${r.id}/menu`);
const item = menu.find((m) => m.available);
console.log(`  ${restaurants.length} restaurants; ordering 2 x ${item.name} from ${r.name}`);

step("wait for order-service to replicate the menu (feed poll)");
let order;
for (let i = 0; i < 20 && !order; i++) {
  try {
    order = await call(`${ORD}/orders`, { method: "POST", token, headers: { "Idempotency-Key": randomUUID() },
      body: { restaurantId: r.id, lines: [{ itemId: item.id, quantity: 2 }] } });
  } catch (e) {
    await sleep(1500);
  }
}
if (!order) throw new Error("order could not be created (replication did not catch up)");
console.log(`  order ${order.id} ${order.status}, total ${order.totalPaise} paise`);

step("open the live status stream");
const ctrl = new AbortController();
const events = [];
const streamRes = await fetch(`${ORD}/orders/${order.id}/stream`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" }, signal: ctrl.signal });
if (!streamRes.ok) throw new Error("stream status " + streamRes.status);
const reader = streamRes.body.getReader();
const dec = new TextDecoder();
let buffer = "";
(async () => {
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += dec.decode(value, { stream: true });
      for (const m of buffer.matchAll(/data:(\{[^\n]*\})\n\n/g)) events.push(JSON.parse(m[1]).status);
      buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
    }
  } catch { /* aborted */ }
})();

step("pay (fake gateway)");
await call(`${PAY}/payments`, { method: "POST", token, headers: { "Idempotency-Key": randomUUID() }, body: { orderId: order.id, amountPaise: order.totalPaise } });

let final;
for (let i = 0; i < 20; i++) {
  final = await call(`${ORD}/orders/${order.id}`, { token });
  if (final.status === "PAID") break;
  await sleep(1000);
}
await sleep(500);
ctrl.abort();
console.log(`  final status ${final.status}; stream events: ${events.join(" -> ")}`);
step("track by order number (no auth)");
if (!order.orderNumber) throw new Error("order has no orderNumber");
const tracked = await call(`${ORD}/orders/track/${order.orderNumber}`);
if (tracked.status !== "PAID" || JSON.stringify(tracked).includes(order.id)) throw new Error("public tracking wrong or leaks the id");
console.log(`  ${tracked.orderNumber}: ${tracked.status} at ${tracked.restaurantName}`);
if (final.status !== "PAID") throw new Error("order did not reach PAID");
if (!events.includes("PAID")) throw new Error("stream did not deliver PAID");
step("fleet: admin enables the delivery flag");
const FLT = "http://127.0.0.1:8085";
const adminEmail = "admin@foodapp.local", adminPass = "Adm1nSmoke99";
let adminTokens;
try {
  await call(`${ID}/auth/register`, { method: "POST", body: { name: "Admin", email: adminEmail, password: adminPass, consent } });
  await sleep(300);
  const l = readFileSync(logFile, "utf8").split(/\r?\n/).filter((x) => x.includes(`VERIFY_EMAIL to ${adminEmail}`));
  await call(`${ID}/auth/email/verify`, { method: "POST", body: { token: l.at(-1).match(/token=([\w-]+)/)[1], password: adminPass } });
} catch { /* already registered by an earlier run */ }
if (await status(() => call(`${ID}/auth/login`, { method: "POST", body: { email: adminEmail, password: adminPass } })) !== 403)
  throw new Error("the admin must not be able to use the ordinary sign-in");
adminTokens = (await call(`${ID}/auth/admin/login`, { method: "POST", body: { email: adminEmail, password: adminPass } })).tokens;
const adminToken = adminTokens.accessToken;
await call(`${ID}/admin/flags/delivery_module`, { method: "PUT", token: adminToken, body: { enabled: true } });

step("admin team: the main admin invites a second admin, who accepts and signs in; then the main admin removes them");
const second = `smoke2admin${Date.now()}@example.com`;
const logLink = (kind, to) => readFileSync(logFile, "utf8").split(/\r?\n/).filter((x) => x.includes(`${kind} to ${to}`)).at(-1)?.match(/token=([\w-]+)/)?.[1];
await call(`${ID}/auth/register`, { method: "POST", body: { name: "Second Admin", email: second, password: adminPass, consent } });
await sleep(300);
await call(`${ID}/auth/email/verify`, { method: "POST", body: { token: logLink("VERIFY_EMAIL", second), password: adminPass } });
await call(`${ID}/admin/team/invites`, { method: "POST", token: adminToken, body: { email: second } });
await sleep(300);
const inviteToken = logLink("ADMIN_INVITE", second);
if (!inviteToken) throw new Error("admin invite link not found in identity-service.log");
await call(`${ID}/auth/admin/invite/accept`, { method: "POST", body: { token: inviteToken, email: second, password: adminPass } });
const secondToken = (await call(`${ID}/auth/admin/login`, { method: "POST", body: { email: second, password: adminPass } })).tokens.accessToken;
await call(`${ID}/admin/flags`, { token: secondToken });
if (await status(() => call(`${ID}/admin/team`, { token: secondToken })) !== 403) throw new Error("a second admin must not manage the team");
const member = (await call(`${ID}/admin/team`, { token: adminToken })).members.find((m) => !m.main);
if (!member) throw new Error("the second admin is missing from the team list");
await call(`${ID}/admin/team/members/${member.userId}`, { method: "DELETE", token: adminToken });
if (await status(() => call(`${ID}/auth/admin/login`, { method: "POST", body: { email: second, password: adminPass } })) !== 403)
  throw new Error("a removed admin can still use the admin sign-in");

step("fleet: a phone user becomes a partner and goes online");
const riderPhone = "+91" + String(9000000000 + Math.floor(Math.random() * 99999999));
await call(`${ID}/auth/otp/request`, { method: "POST", body: { phone: riderPhone } });
await sleep(500);
const rcode = readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => l.includes(`OTP for ${riderPhone}`)).at(-1)?.match(/is (\d+)/)?.[1];
const rt = await call(`${ID}/auth/otp/verify`, { method: "POST", body: { phone: riderPhone, code: rcode, name: "Smoke Rider", consent } });
await call(`${ID}/me/partner`, { method: "POST", token: rt.accessToken });
const rr = await call(`${ID}/auth/refresh`, { method: "POST", body: { refreshToken: rt.refreshToken } });
const riderToken = rr.accessToken;
if (!(await call(`${ID}/me`, { token: riderToken })).roles.includes("PARTNER")) throw new Error("refreshed token lacks PARTNER role");
await call(`${FLT}/fleet/partners/me`, { method: "POST", token: riderToken, body: { name: "Smoke Rider", vehicle: "Bike" } });
await call(`${FLT}/fleet/me/online`, { method: "PUT", token: riderToken, body: { online: true } });

let pushes = 0;
const fctrl = new AbortController();
const fres = await fetch(`${FLT}/fleet/stream`, { headers: { Authorization: `Bearer ${riderToken}`, Accept: "text/event-stream" }, signal: fctrl.signal });
if (!fres.ok) throw new Error("fleet stream status " + fres.status);
(async () => {
  const rd = fres.body.getReader(); const dc = new TextDecoder();
  try { for (;;) { const { done, value } = await rd.read(); if (done) return; pushes += (dc.decode(value).match(/event:changed/g) || []).length; } } catch { /* aborted */ }
})();

step("restaurant: admin grants the owner role and links the restaurant; owner sees only its orders and moves them on");
const ownerEmail = `owner${Date.now()}@example.com`, ownerPass = "0wnerSmoke99";
await call(`${ID}/auth/register`, { method: "POST", body: { name: "Smoke Owner", email: ownerEmail, password: ownerPass, consent } });
{
  const l = readFileSync(logFile, "utf8").split(/\r?\n/).filter((x) => x.includes(`VERIFY_EMAIL to ${ownerEmail}`));
  await call(`${ID}/auth/email/verify`, { method: "POST", body: { token: l.at(-1).match(/token=([\w-]+)/)[1], password: ownerPass } });
}
const granted = await call(`${ID}/admin/restaurant-owners`, { method: "POST", token: adminToken, body: { email: ownerEmail } });
const rFull = await call(`${CAT}/restaurants/${r.id}`);
await call(`${CAT}/restaurants/${r.id}`, { method: "PUT", token: adminToken, body: {
  name: rFull.name, fssaiNumber: rFull.fssaiNumber, kitchenCertificationLevel: rFull.kitchenCertificationLevel,
  lat: rFull.lat, lng: rFull.lng, deliveryRadiusMeters: rFull.deliveryRadiusMeters, open: rFull.open,
  cuisine: rFull.cuisine, ownerUserId: granted.userId } });
const ownerToken = (await call(`${ID}/auth/login`, { method: "POST", body: { email: ownerEmail, password: ownerPass } })).accessToken;
let seen;
for (let i = 0; i < 20 && !seen; i++) {
  seen = (await call(`${ORD}/orders/restaurant`, { token: ownerToken })).find((o) => o.id === order.id);
  if (!seen) await sleep(1000);
}
if (!seen) throw new Error("restaurant owner does not see the order");
if (JSON.stringify(seen).match(/customerId|deliveryOtp/)) throw new Error("staff view leaks customer data");
if ((await status(() => call(`${ORD}/orders/${order.id}/accept`, { method: "POST", token }))) !== 403) throw new Error("customer must not accept orders");
await call(`${ORD}/orders/${order.id}/accept`, { method: "POST", token: ownerToken });
await call(`${ORD}/orders/${order.id}/preparing`, { method: "POST", token: ownerToken });

step("fleet: the paid order appears in the pool; partner accepts");
let job;
for (let i = 0; i < 20 && !job; i++) {
  job = (await call(`${FLT}/fleet/pool`, { token: riderToken })).find((d) => d.orderId === order.id);
  if (!job) await sleep(1000);
}
if (!job) throw new Error("order never reached the delivery pool");
await call(`${FLT}/fleet/deliveries/${order.id}/accept`, { method: "POST", token: riderToken });
let s;
for (let i = 0; i < 20; i++) {
  s = (await call(`${ORD}/orders/${order.id}`, { token })).status;
  if (s === "RIDER_ASSIGNED") break;
  await sleep(1000);
}
if (s !== "RIDER_ASSIGNED") throw new Error("order did not become RIDER_ASSIGNED, got " + s);

step("fleet: pick up, then deliver with the customer's OTP");
await call(`${ORD}/orders/${order.id}/rider/picked-up`, { method: "POST", token: riderToken });
const picked = await call(`${ORD}/orders/${order.id}`, { token });
const otp = picked.deliveryOtp;
if (!otp) throw new Error("customer cannot see the delivery OTP: " + JSON.stringify(picked));
const done = await call(`${ORD}/orders/${order.id}/rider/deliver`, { method: "POST", token: riderToken, body: { otp } });
if (done.status !== "DELIVERED") throw new Error("not delivered: " + JSON.stringify(done));
let fj;
for (let i = 0; i < 15; i++) {
  fj = (await call(`${FLT}/fleet/me/deliveries`, { token: riderToken })).length;
  if (fj === 0) break;
  await sleep(1000);
}
console.log("  delivered; fleet closed the job: " + (fj === 0));
fctrl.abort();
console.log("  fleet stream pushes: " + pushes);
if (pushes < 3) throw new Error("fleet stream pushed too few changes: " + pushes);
console.log("SMOKE TEST PASSED");
