import { Hono } from 'hono';
import { generateChallenge } from '../../lib/pow.js';

const powRouter = new Hono();

powRouter.get('/challenge', async (c) => {
  const challenge = generateChallenge();
  return c.json(challenge);
});

export default powRouter;

