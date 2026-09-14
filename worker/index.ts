import { handleProducts, type ProductsEnv } from './products';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/fire/products') return handleProducts(request, env);
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: { code: 'not_found', message: '요청한 API가 없습니다.' } }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env & ProductsEnv>;
