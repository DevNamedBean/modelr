import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '');
const port = Number(process.env.PORT) || 10000;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const sessionMaxAge = 30 * 24 * 60 * 60;
const maxBodySize = 25 * 1024 * 1024;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8'
};

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(data === null ? '' : JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodySize) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }

function cookieValue(request, name) {
  const cookie = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function sessionCookie(request, token) {
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(request.socket.encrypted);
  return `modelr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionMaxAge}${secure ? '; Secure' : ''}`;
}

async function createSession(userId, response, request) {
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO modelr_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [hashToken(token), userId]);
  response.setHeader('Set-Cookie', sessionCookie(request, token));
}

async function currentUser(request) {
  const token = cookieValue(request, 'modelr_session');
  if (!token) return null;
  const result = await pool.query(
    'SELECT users.id, users.email FROM modelr_sessions JOIN modelr_users AS users ON users.id = modelr_sessions.user_id WHERE modelr_sessions.token_hash = $1 AND modelr_sessions.expires_at > NOW()',
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

async function passwordHash(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`;
}

async function passwordMatches(password, storedHash) {
  const [saltHex, expectedHex] = String(storedHash).split(':');
  if (!saltHex || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validProject(project) {
  return project && typeof project.id === 'string' && project.id.length <= 200 &&
    typeof project.name === 'string' && project.name.trim().length > 0 && project.name.length <= 100 &&
    Array.isArray(project.scene);
}

async function storeProject(database, userId, project) {
  const scene = JSON.stringify(project.scene);
  const objects = Number.isInteger(project.objects) ? Math.max(0, project.objects) : project.scene.length;
  const result = await database.query(
    `INSERT INTO modelr_projects (user_id, id, name, objects, scene, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, objects = EXCLUDED.objects, scene = EXCLUDED.scene, updated_at = NOW()
     RETURNING id, name, objects, updated_at AS "updatedAt", scene`,
    [userId, project.id, project.name.trim(), objects, scene]
  );
  return result.rows[0];
}

async function handleApi(request, response, url) {
  if (!pool) {
    sendJson(response, 503, { error: 'Cloud storage is not configured. Set DATABASE_URL on the server.' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/signup') {
    const body = await readJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      sendJson(response, 400, { error: 'Enter a valid email address.' }); return;
    }
    if (password.length < 8 || password.length > 200) {
      sendJson(response, 400, { error: 'Password must be between 8 and 200 characters.' }); return;
    }
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'INSERT INTO modelr_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, await passwordHash(password)]
      );
      user = result.rows[0];
      const legacyProjects = Array.isArray(body.projects) ? body.projects.slice(0, 100) : [];
      for (const project of legacyProjects) if (validProject(project)) await storeProject(client, user.id, project);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') { sendJson(response, 409, { error: 'An account with this email already exists.' }); return; }
      throw error;
    } finally {
      client.release();
    }
    await createSession(user.id, response, request);
    sendJson(response, 201, { email: user.email });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const result = await pool.query('SELECT id, email, password_hash FROM modelr_users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !await passwordMatches(password, user.password_hash)) {
      sendJson(response, 401, { error: 'Email or password is incorrect.' }); return;
    }
    await pool.query('DELETE FROM modelr_sessions WHERE expires_at <= NOW()');
    await createSession(user.id, response, request);
    sendJson(response, 200, { email: user.email });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookieValue(request, 'modelr_session');
    if (token) await pool.query('DELETE FROM modelr_sessions WHERE token_hash = $1', [hashToken(token)]);
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '').replace(`Max-Age=${sessionMaxAge}`, 'Max-Age=0') });
    return;
  }

  const user = await currentUser(request);
  if (request.method === 'GET' && url.pathname === '/api/auth/session') {
    if (!user) { sendJson(response, 401, { error: 'Not signed in.' }); return; }
    sendJson(response, 200, { email: user.email }); return;
  }
  if (!user) { sendJson(response, 401, { error: 'Please sign in again.' }); return; }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const result = await pool.query(
      'SELECT id, name, objects, updated_at AS "updatedAt" FROM modelr_projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [user.id]
    );
    sendJson(response, 200, result.rows); return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/projects') {
    const project = await readJsonBody(request);
    if (!validProject(project)) { sendJson(response, 400, { error: 'Project data is invalid.' }); return; }
    sendJson(response, 200, await storeProject(pool, user.id, project)); return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === 'GET' && projectMatch) {
    const result = await pool.query(
      'SELECT id, name, objects, updated_at AS "updatedAt", scene FROM modelr_projects WHERE user_id = $1 AND id = $2',
      [user.id, decodeURIComponent(projectMatch[1])]
    );
    if (!result.rows[0]) { sendJson(response, 404, { error: 'Project not found.' }); return; }
    sendJson(response, 200, result.rows[0]); return;
  }
  if (request.method === 'DELETE' && projectMatch) {
    await pool.query('DELETE FROM modelr_projects WHERE user_id = $1 AND id = $2', [user.id, decodeURIComponent(projectMatch[1])]);
    sendJson(response, 200, { ok: true }); return;
  }

  sendJson(response, 404, { error: 'API endpoint not found.' });
}

async function initializeDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS modelr_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS modelr_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES modelr_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS modelr_projects (
      user_id BIGINT NOT NULL REFERENCES modelr_users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      objects INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scene JSONB NOT NULL,
      PRIMARY KEY (user_id, id)
    );
  `);
}

async function handleRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(request, response, url);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  let requestPath;
  try { requestPath = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = normalize(join(root, relativePath));
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error('Request failed:', error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'An unexpected server error occurred.' });
    else response.end();
  });
});

initializeDatabase().then(() => {
  server.listen(port, '0.0.0.0', () => console.log(`modelr listening on ${port}`));
}).catch(error => {
  console.error('Could not initialize database:', error);
  process.exit(1);
});