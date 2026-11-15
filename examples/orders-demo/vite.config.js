import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The demo has no backend. The dev server answers GET /api/orders itself, and ?state= picks what it answers,
// so you can see every state in a browser: /?state=empty, /?state=loading, /?state=error
const ORDERS = [
  { id: '#1042', customer: 'Avery Brooks', date: 'Nov 3', status: 'paid', total: 128.5 },
  { id: '#1041', customer: 'Jordan Lee', date: 'Nov 3', status: 'pending', total: 64 },
  { id: '#1040', customer: 'Sam Rivera with a very long display name for truncation', date: 'Nov 2', status: 'refunded', total: 12.99 },
];
const mockApi = () => ({
  name: 'mock-orders-api',
  configureServer(server) {
    server.middlewares.use('/api/orders', (req, res) => {
      const state = new URL(req.headers.referer || 'http://localhost/').searchParams.get('state');
      if (state === 'loading') return; // never answers
      res.setHeader('Content-Type', 'application/json');
      if (state === 'error') { res.statusCode = 503; return res.end(JSON.stringify({ message: 'The order service is not responding. Try again in a minute.' })); }
      res.end(JSON.stringify({ orders: state === 'empty' ? [] : ORDERS }));
    });
  },
});

export default defineConfig({ plugins: [react(), tailwindcss(), mockApi()] });
