export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false,
  },
};

export { default } from '../apps/api/dist/vercel.js';
