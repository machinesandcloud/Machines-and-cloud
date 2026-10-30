import { thumbtackCallback } from './lib/thumbtack-callback.mjs';
export const config = { path: '/api/thumbtack/connect' };
export default thumbtackCallback('production');
