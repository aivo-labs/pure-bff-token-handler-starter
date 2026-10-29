import { FastifyInstance } from 'fastify';

export async function apiRoutes(fastify: FastifyInstance) {
  // Protected GET route
  fastify.get('/protected/profile', async (request, reply) => {
    const user = request.session.get('user');
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    return {
      message: 'Access granted to confidential resource via Pure BFF',
      user,
      serverTime: new Date().toISOString(),
      architecture: 'Pure BFF + Token Handler',
    };
  });

  // Protected POST mutation (strictly guarded by anti-CSRF hook)
  fastify.post('/protected/action', async (request, reply) => {
    const user = request.session.get('user');
    const body = request.body as any;

    return {
      success: true,
      executedBy: user?.name,
      action: body?.action || 'default_action',
      timestamp: Date.now(),
      status: 'Mutation allowed: CSRF token verified',
    };
  });
}
