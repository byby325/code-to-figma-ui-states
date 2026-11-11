// API responses for each card: fetch a copy from the real backend and save it as fixtures/*.json as the base; each card clones it and changes only what differs in its state.
// How to fetch (the signed-in cookie is saved to a jar; replace the API paths with your project's):
//   curl -s -c jar -b jar -X POST https://dev.example.com/api/login -d user=demo -d pwd=demo
//   curl -s -b jar https://dev.example.com/api/me     > fixtures/me.json
//   curl -s -b jar https://dev.example.com/api/orders > fixtures/orders.json
// fixtures may contain real personal data: use a demo account or test environment data, and don't commit production data.
const fs = require('fs');
const path = require('path');

const TODAY = '2026-01-15'; // fix due dates and relative times computed from "today", or the screens can't be reproduced
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const me = () => ({ ...load('me.json'), today: TODAY });
const orders = () => clone(load('orders.json'));

// For each card: what each API returns. A value can be
//   a function: returns the JSON body (200)
//   'hang': never responds, so the screen stays in its loading state
//   { status, body }: a specific status code and body (error states)
const S = {
  O01: { '/api/me': me, '/api/orders': orders },
  O02: { '/api/me': me, '/api/orders': () => ({ ...orders(), items: [] }) }, // empty list
  O03: { '/api/me': me, '/api/orders': () => { const o = orders(); o.items[0].status = 'cancelled'; return o; } },
  O04: { '/api/me': me, '/api/orders': () => { const o = orders(); o.items[0].name = 'An extra-long product name to check that truncation and line wrapping follow the design. '.repeat(2); return o; } },
  L01: { '/api/me': me, '/api/orders': 'hang' },
  // Error responses must use the format and message the backend really returns; without a message, the frontend framework may fill in "Internal Server Error" on its own
  L02: { '/api/me': me, '/api/orders': { status: 500, body: { error: 'ServerError', message: "The server isn't responding right now. Please try again later." } } },
  L03: { '/api/me': me, '/api/orders': { status: 403, body: { error: 'Forbidden', message: "You don't have permission to view orders." } } },
};

async function route(context, id) {
  const s = S[id];
  if (!s) throw new Error(`scenarios.cjs has no ${id}`);
  for (const [api, value] of Object.entries(s)) {
    await context.route(`**${api}*`, r => {
      if (value === 'hang') return; // neither fulfill nor continue: the request hangs forever
      if (typeof value === 'function') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value()) });
      return r.fulfill({ status: value.status, contentType: 'application/json', body: JSON.stringify(value.body) });
    });
  }
}

module.exports = { S, route, TODAY };
