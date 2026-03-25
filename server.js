import { createServer } from 'node:http';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = process.env.ZHIPU_MODEL || 'glm-4-flash';
const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TTS_MODEL_NAME = process.env.TTS_MODEL || 'sambert-eva-v1';
const ASR_MODEL_NAME = process.env.ASR_MODEL || 'paraformer-v2';
const DASHSCOPE_ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const uploadDir = path.join(os.tmpdir(), 'linguaflow-audio');

const DEFAULT_READING_SOURCES = [
  { name: 'Stratechery', url: 'https://stratechery.com/', type: 'reading', description: 'Deep strategy, tech, and business analysis for product-minded readers.' },
  { name: 'First Round Review', url: 'https://review.firstround.com/', type: 'reading', description: 'Startup, product, hiring, and operator essays with practical takeaways.' },
  { name: 'SVPG Articles', url: 'https://www.svpg.com/articles/', type: 'reading', description: 'Product management, discovery, and product leadership writing by SVPG.' },
  { name: 'Harvard Business Review', url: 'https://hbr.org/', type: 'reading', description: 'Management, leadership, workplace, and professional communication reading.' },
  { name: 'Farnam Street', url: 'https://fs.blog/', type: 'reading', description: 'Mental models, decision-making, and thinking-oriented longform reading.' },
  { name: 'James Clear', url: 'https://jamesclear.com/articles', type: 'reading', description: 'Clear nonfiction about habits, growth, and self-improvement.' },
  { name: 'Medium PM', url: 'https://medium.com/tag/product-management', type: 'reading', description: 'Product management writing and practical PM perspectives.' },
  { name: 'Indie Hackers', url: 'https://www.indiehackers.com/', type: 'reading', description: 'Founder stories, startups, and internet business discussions.' },
];

const DEFAULT_LISTENING_SOURCES = [
  { name: "Lenny's Podcast", url: 'https://www.lennyspodcast.com/', type: 'listening', description: 'Product, growth, career, and startup interviews in conversational English.' },
  { name: 'Masters of Scale', url: 'https://mastersofscale.com/', type: 'listening', description: 'Business, leadership, and company-building stories from founders and operators.' },
  { name: 'Tim Ferriss Show', url: 'https://tim.blog/podcast', type: 'listening', description: 'Long-form interviews about performance, habits, work, and life.' },
  { name: 'a16z Podcast', url: 'https://a16z.com/podcasts', type: 'listening', description: 'Tech, startup, AI, and product discussions at native speed.' },
  { name: 'The Journal', url: 'https://www.wsj.com/podcasts/the-journal', type: 'listening', description: 'News and business storytelling for stronger listening comprehension.' },
  { name: 'How I Built This', url: 'https://www.npr.org/podcasts/510313/how-i-built-this', type: 'listening', description: 'Founder stories and company journeys in a strong interview format.' },
  { name: 'Look & Sound of Leadership', url: 'https://essentialcomm.com/podcast/', type: 'listening', description: 'Leadership communication and workplace speaking patterns.' },
];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

async function callZhipu(messages, wantsJson = false, modelName = MODEL_NAME) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ZHIPU_API_KEY');
  }

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: 0.7,
      response_format: wantsJson ? { type: 'json_object' } : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zhipu API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response from Zhipu');
  }

  return content;
}

function parseBinaryFrame(data) {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.alloc(0);
}

async function synthesizeDashscopeSpeech(text, voice = TTS_MODEL_NAME) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DASHSCOPE_API_KEY');
  }

  return new Promise((resolve, reject) => {
    const taskId = `linguaflow-${randomUUID()}`;
    const chunks = [];
    let settled = false;

    const ws = new WebSocket(DASHSCOPE_WS_URL, {
      headers: {
        Authorization: `bearer ${apiKey}`,
        'X-DashScope-DataInspection': 'disable',
      },
    });

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // noop
      }
      handler(value);
    };

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: voice,
            parameters: {
              text,
              format: 'mp3',
              sample_rate: 48000,
            },
          },
        })
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buffer = parseBinaryFrame(data);
        if (buffer.length) chunks.push(buffer);
        return;
      }

      try {
        const message = JSON.parse(String(data));
        if (message.header?.event === 'task-failed') {
          finish(reject, new Error(message.header?.error_message || 'DashScope TTS failed'));
          return;
        }
        if (message.header?.event === 'task-finished') {
          finish(resolve, Buffer.concat(chunks));
        }
      } catch (error) {
        finish(reject, error);
      }
    });

    ws.on('error', (error) => finish(reject, error));
    ws.on('close', () => {
      if (!settled && chunks.length) {
        finish(resolve, Buffer.concat(chunks));
      } else if (!settled) {
        finish(reject, new Error('DashScope TTS connection closed unexpectedly'));
      }
    });
  });
}

function getDashscopeApiKey() {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DASHSCOPE_API_KEY');
  }
  return apiKey;
}

function buildPublicOrigin(req) {
  const host = req.headers.host;
  if (!host) {
    throw new Error('Missing host header for ASR upload URL');
  }

  if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
    throw new Error('Voice input requires a public deployment because Alibaba ASR only accepts public audio URLs.');
  }

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${protocol}://${host}`;
}

function getLanguageHint(language) {
  const hints = {
    English: 'en',
    French: 'fr',
    Japanese: 'ja',
    Chinese: 'zh',
  };

  return hints[language] || 'en';
}

async function saveUploadedAudio(audioBuffer) {
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.wav`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, audioBuffer);
  return { fileName, filePath };
}

async function submitDashscopeAsrTask(fileUrl, languageHint) {
  const response = await fetch(DASHSCOPE_ASR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getDashscopeApiKey()}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: ASR_MODEL_NAME,
      input: {
        file_urls: [fileUrl],
      },
      parameters: {
        channel_id: [0],
        language_hints: [languageHint],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`DashScope ASR submit failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const taskId = data?.output?.task_id;
  if (!taskId) {
    throw new Error('DashScope ASR did not return a task_id');
  }
  return taskId;
}

async function pollDashscopeAsrResult(taskId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getDashscopeApiKey()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DashScope ASR query failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const output = data?.output;
    const taskStatus = output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      const result = output?.results?.find((item) => item?.subtask_status === 'SUCCEEDED');
      const transcriptionUrl = result?.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('DashScope ASR finished without a transcription_url');
      }
      return transcriptionUrl;
    }

    if (taskStatus === 'FAILED' || taskStatus === 'CANCELED') {
      throw new Error(output?.message || `DashScope ASR task failed with status ${taskStatus}`);
    }

    await delay(1200);
  }

  throw new Error('DashScope ASR timed out while waiting for the transcript');
}

async function fetchDashscopeTranscript(transcriptionUrl) {
  const response = await fetch(transcriptionUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ASR transcript JSON: ${response.status}`);
  }

  const data = await response.json();
  const transcript = Array.isArray(data?.transcripts)
    ? data.transcripts
        .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';

  if (!transcript) {
    throw new Error('ASR transcript was empty');
  }

  return transcript;
}

let serverSupabaseClient = null;

function getServerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!serverSupabaseClient) {
    serverSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return serverSupabaseClient;
}

async function resolveSupabaseUserIdByEmail(email) {
  const client = getServerSupabaseClient();
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw error;
  }

  const user = data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user?.id) {
    throw new Error('No Supabase user found for this email');
  }

  return user.id;
}

function buildClipperPayload({ text, type, source, sourceUrl, language }) {
  const now = new Date().toISOString();
  const normalizedLanguage = language || 'English';

  if (type === 'word') {
    return {
      item_type: 'vocab',
      item_id: randomUUID(),
      language: normalizedLanguage,
      payload: {
        id: randomUUID(),
        word: text,
        definition: 'Fetching...',
        chineseDefinition: '获取中...',
        contextSentence: source || 'Web Clip',
        contextSentenceZh: '例句中文示意获取中...',
        sourceUrl: sourceUrl || null,
        dateAdded: now,
        language: normalizedLanguage,
      },
    };
  }

  return {
    item_type: 'sentence',
    item_id: randomUUID(),
    language: normalizedLanguage,
    payload: {
      id: randomUUID(),
      text,
      source: source || 'Web Clip',
      sourceUrl: sourceUrl || null,
      dateAdded: now,
      language: normalizedLanguage,
    },
  };
}

function getClipperSecret() {
  const secret = process.env.CLIPPER_SHARED_SECRET;
  if (!secret) {
    throw new Error('Missing CLIPPER_SHARED_SECRET');
  }
  return secret;
}

function createClipperToken({ userId, email }) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email,
      issuedAt: new Date().toISOString(),
    }),
    'utf8'
  ).toString('base64url');

  const signature = createHmac('sha256', getClipperSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyClipperToken(token) {
  const [payloadPart, signaturePart] = String(token || '').trim().split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Invalid clipper token');
  }

  const expectedSignature = createHmac('sha256', getClipperSecret()).update(payloadPart).digest('base64url');
  const provided = Buffer.from(signaturePart, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('Invalid clipper token');
  }

  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (!payload?.userId || !payload?.email) {
    throw new Error('Invalid clipper token');
  }

  return {
    userId: String(payload.userId),
    email: String(payload.email),
  };
}

async function handleClipperTokenRequest(req, res) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!accessToken) {
      return sendJson(res, 401, { error: 'Missing access token' });
    }

    const client = getServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser(accessToken);

    if (error || !user?.id || !user?.email) {
      return sendJson(res, 401, { error: 'Invalid session' });
    }

    const clipperToken = createClipperToken({ userId: user.id, email: user.email });
    return sendJson(res, 200, {
      clipperToken,
      email: user.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown clipper token error';
    return sendJson(res, 500, { error: message });
  }
}

async function handleClipperImportRequest(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const clipperKey = typeof body.clipperKey === 'string' ? body.clipperKey.trim() : '';
    const clipperToken = typeof body.clipperToken === 'string' ? body.clipperToken.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const type = body.type === 'sentence' ? 'sentence' : body.type === 'word' ? 'word' : '';
    const source = typeof body.source === 'string' ? body.source.trim() : 'Web Clip';
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    const language = typeof body.language === 'string' ? body.language.trim() : 'English';

    if (!text) {
      return sendJson(res, 400, { error: 'Missing text' });
    }

    if (!type) {
      return sendJson(res, 400, { error: 'Invalid clip type' });
    }

    let resolvedUserId = '';
    let resolvedEmail = email;

    if (clipperToken) {
      const verified = verifyClipperToken(clipperToken);
      resolvedUserId = verified.userId;
      resolvedEmail = verified.email;
    } else {
      if (!process.env.CLIPPER_SHARED_SECRET) {
        return sendJson(res, 503, { error: 'Missing CLIPPER_SHARED_SECRET on server' });
      }

      if (!clipperKey || clipperKey !== process.env.CLIPPER_SHARED_SECRET) {
        return sendJson(res, 401, { error: 'Invalid clipper key' });
      }

      if (!resolvedEmail) {
        return sendJson(res, 400, { error: 'Missing email' });
      }

      resolvedUserId = await resolveSupabaseUserIdByEmail(resolvedEmail);
    }

    const payload = buildClipperPayload({ text, type, source, sourceUrl, language });
    const client = getServerSupabaseClient();

    const { error } = await client.from('learning_items').upsert(
      {
        user_id: resolvedUserId,
        ...payload,
      },
      {
        onConflict: 'user_id,item_type,item_id',
      }
    );

    if (error) {
      throw error;
    }

    return sendJson(res, 200, { ok: true, itemType: payload.item_type, itemId: payload.item_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown clipper import error';
    return sendJson(res, 500, { error: message });
  }
}

function parseJson(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

function chooseCuratedItem(items, seenTitles = []) {
  const unseen = items.filter((item) => !seenTitles.includes(item.title));
  const pool = unseen.length ? unseen : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeCustomSources(value, type) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name.trim() : '',
      url: typeof item.url === 'string' ? item.url.trim() : '',
      type: typeof item.type === 'string' ? item.type.trim() : 'both',
      description: typeof item.description === 'string' ? item.description.trim() : '',
    }))
    .filter((item) => item.name && item.url && (item.type === type || item.type === 'both'));
}

function chooseCustomSource(sources, excludeUrls = []) {
  const normalizedExcludeUrls = Array.isArray(excludeUrls)
    ? excludeUrls.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

  const unseen = sources.filter((item) => !normalizedExcludeUrls.includes(item.url));
  const pool = unseen.length ? unseen : sources;
  return pool[Math.floor(Math.random() * pool.length)];
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function normalizeAbsoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return '';
  }
}

function parseFeedEntries(xml, sourceUrl) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryMatches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const blocks = [...itemMatches, ...entryMatches];

  for (const block of blocks) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
      block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);

    const title = stripTags(titleMatch?.[1] || '');
    const url = normalizeAbsoluteUrl(sourceUrl, stripTags(linkMatch?.[1] || ''));
    if (title && url) {
      items.push({ title, url });
    }
  }

  return items;
}

function parseHtmlCandidates(html, sourceUrl) {
  const candidates = [];
  const patterns = [
    /<article\b[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/article>/gi,
    /<h[1-3][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1-3]>/gi,
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const url = normalizeAbsoluteUrl(sourceUrl, stripTags(match[1] || ''));
      const title = stripTags(match[2] || '');
      if (!url || !title) continue;
      candidates.push({ title, url });
      if (candidates.length >= 40) {
        return candidates;
      }
    }
  }

  return candidates;
}

async function discoverSourceEntries(sourceUrl) {
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'LinguaFlow/1.0 (+https://crazy-learning.onrender.com)',
      },
    });
    if (!response.ok) {
      return [];
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const body = await response.text();
    const rawItems =
      contentType.includes('xml') || /<(rss|feed)\b/i.test(body)
        ? parseFeedEntries(body, sourceUrl)
        : parseHtmlCandidates(body, sourceUrl);

    const sourceHost = new URL(sourceUrl).host;
    const seen = new Set();

    return rawItems
      .filter((item) => {
        if (!item.url || !item.title) return false;
        if (item.url === sourceUrl) return false;
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        try {
          const candidateUrl = new URL(item.url);
          if (candidateUrl.host !== sourceHost) return false;
          if (candidateUrl.hash) candidateUrl.hash = '';
          const pathname = candidateUrl.pathname.toLowerCase();
          if (
            pathname === '/' ||
            pathname.includes('/tag/') ||
            pathname.includes('/category/') ||
            pathname.includes('/search') ||
            pathname.includes('/about') ||
            pathname.includes('/contact')
          ) {
            return false;
          }
        } catch {
          return false;
        }
        return item.title.length > 8;
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}

function chooseSourceEntry(entries, excludeUrls = []) {
  const normalizedExcludeUrls = Array.isArray(excludeUrls)
    ? excludeUrls.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];
  const unseen = entries.filter((item) => !normalizedExcludeUrls.includes(item.url));
  const pool = unseen.length ? unseen : entries;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

async function buildCustomSourceContent({ language, type, level, source, excludeUrls = [] }) {
  const typeLabel = type === 'listening' ? 'listening' : 'reading';
  const contentLength = type === 'listening' ? '250-400 words' : '250-350 words';
  const voiceLabel = type === 'listening' ? 'listening guide or transcript-style practice excerpt' : 'reading practice excerpt';
  const learnerGoal =
    type === 'listening'
      ? 'help the learner follow spoken English, shadow useful lines, and summarize key points'
      : 'help the learner skim, read closely, and collect reusable topic vocabulary';
  const discoveredEntries = await discoverSourceEntries(source.url);
  const chosenEntry = chooseSourceEntry(discoveredEntries, excludeUrls);
  const targetUrl = chosenEntry?.url || source.url;
  const targetTitle = chosenEntry?.title || source.name;

  const content = await callZhipu(
    [
      {
        role: 'system',
        content: 'You are LinguaFlow content curator. Create learner-friendly daily practice cards based on a user-selected source. Return strict JSON only.',
      },
      {
        role: 'user',
        content: `The learner is studying ${language}. Their preferred ${typeLabel} source is:
Name: ${source.name}
Source URL: ${source.url}
Description: ${source.description || 'No extra description'}
Selected item title: ${targetTitle}
Selected item URL: ${targetUrl}

Return strict JSON with:
- title
- summary
- url
- content
- source

Rules:
- Use exactly this URL for the url field: ${targetUrl}
- Use exactly this source name for the source field: ${source.name}
- Use the selected item title as the main topic anchor for this card.
- Build a believable daily ${typeLabel} practice card inspired by the selected item and the source's usual tone.
- The content should be a ${voiceLabel}, around ${contentLength}.
- The learner level is ${level || 'Intermediate'}.
- Keep it practical and reusable for English learners.
- ${learnerGoal}
- Do not mention that you are inventing or simulating anything.
- Do not switch to a different website or source.`,
      },
    ],
    true
  );

  return parseJson(content);
}


async function handleAiRequest(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const action = body.action;
    const payload = body.payload || {};

    switch (action) {
      case 'dailyListening': {
        const language = String(payload.language || 'English');
        const seenTitles = Array.isArray(payload.seenTitles) ? payload.seenTitles.join(', ') : '';
        const customSources = normalizeCustomSources(payload.customSources, 'listening');
        const excludeUrls = Array.isArray(payload.excludeUrls) ? payload.excludeUrls : [];
        if (customSources.length) {
          const source = chooseCustomSource(customSources, excludeUrls);
          const result = await buildCustomSourceContent({
            language,
            type: 'listening',
            source,
            excludeUrls,
          });
          return sendJson(res, 200, result);
        }
        if (language === 'English') {
          const source = chooseCustomSource(DEFAULT_LISTENING_SOURCES, excludeUrls);
          const result = await buildCustomSourceContent({
            language,
            type: 'listening',
            source,
            excludeUrls,
          });
          return sendJson(res, 200, result);
        }
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are an experienced language coach. Always return strict JSON only.',
            },
            {
              role: 'user',
              content: `Find an educational, news, or TED Talk style listening practice item in ${language} suitable for intermediate-advanced learners. Avoid topics similar to: ${seenTitles || 'none'}. Return JSON with: title, summary, url, content, source. The content field should be a learner-friendly transcript or excerpt around 250-400 words.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'readingSuggestions': {
        const language = String(payload.language || 'English');
        const level = String(payload.level || 'Intermediate');
        const customSources = normalizeCustomSources(payload.customSources, 'reading');
        const excludeUrls = Array.isArray(payload.excludeUrls) ? payload.excludeUrls : [];
        if (customSources.length) {
          const source = chooseCustomSource(customSources, excludeUrls);
          const result = await buildCustomSourceContent({
            language,
            type: 'reading',
            level,
            source,
            excludeUrls,
          });
          return sendJson(res, 200, [result]);
        }
        if (language === 'English') {
          const source = chooseCustomSource(DEFAULT_READING_SOURCES, excludeUrls);
          const result = await buildCustomSourceContent({
            language,
            type: 'reading',
            level,
            source,
            excludeUrls,
          });
          return sendJson(res, 200, [result]);
        }
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are an experienced language coach. Always return strict JSON only.',
            },
            {
              role: 'user',
              content: `Provide a JSON array with exactly one reading suggestion in ${language} for ${level} learners. Each item must include title, source, url, summary, and content. The content should be an original short article or adapted passage around 250-350 words.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'writingTopic': {
        const language = String(payload.language || 'English');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You create concise, creative writing prompts for language learners. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Give one thought-provoking writing prompt for an advanced student learning ${language}. Return JSON with a single field named topic.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'analyzeWriting': {
        const language = String(payload.language || 'English');
        const text = String(payload.text || '');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are a supportive language writing tutor. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Review this student's ${language} writing:\n\n${text}\n\nReturn JSON with these fields: original, corrected, upgraded, modelEssay. corrected should sound natural, upgraded should use richer vocabulary, and modelEssay should be a short high-quality reference response on the same theme.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'todayStory': {
        const language = String(payload.language || 'English');
        const transcript = String(payload.transcript || '');
        const mode = String(payload.mode || 'mixed');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are LinguaFlow Today Story Coach. Turn a learner’s rough daily story into a polished but still believable English story. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `The learner is studying ${language}. Their speaking mode is ${mode}.
They may use Chinese, English, or a mix.

Transcript:
${transcript}

Return strict JSON with:
- title: short, natural, specific
- original: lightly cleaned transcript with better punctuation and sentence breaks, but still sounds like the user
- rewritten: a clear first-person English version at B1-B2 difficulty
- keyPhrases: exactly 3 items, each with original, explanation, alternative
- comment: one short Chinese or mixed-language comment that praises one strength and gives one practical improvement
- tags: 2 to 4 short tags such as work, study, emotions, friendship, travel

Rules:
- Keep the same story facts and first-person perspective.
- Do not make it sound too advanced or like a different person wrote it.
- The rewritten version should feel easy to retell aloud in an interview, exam, or daily chat.
- keyPhrases should be genuinely useful chunks from the rewritten story, not generic textbook phrases.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'freeTalk': {
        const language = String(payload.language || 'English');
        const userMessage = String(payload.userMessage || '');
        const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: `You are LinguaFlow Free Talk Coach. Have a warm, natural, low-pressure spoken English conversation with a Chinese learner.
Return strict JSON only with:
- reply
- followUp
- quickReplies (array of 2 to 3 short starter ideas)
- correction
- improvements (array of 2 short improvement lines)

Rules:
- Sound like a friendly real person, not a teacher or rubric.
- Keep reply extremely short: ideally 1 short sentence, maximum 2.
- Ask one follow-up question at most.
- Help the learner keep talking even if they feel they have nothing to say.
- If the learner's English is rough, answer kindly and keep the chat moving.
- correction should be optional and can be one short summary line.
- improvements should be the real value:
  1. rewrite the learner's message into a clearer, more natural version they can say next time
  2. give one more upgraded version or one especially useful sentence chunk
- If the learner message is long, improvements must still cover the main errors and awkward phrasing, not just one tiny point.
- Keep each improvement concise but meaningful, usually 1 to 2 sentences.
- quickReplies should be short, everyday prompts like "Tell me about your day" or "What are you working on?".
- The main conversation language should be English, but correction can use a little Chinese if helpful.
- The learner UI language is ${language}.`,
            },
            {
              role: 'user',
              content: `Recent conversation: ${JSON.stringify(history)}
Latest learner message: ${userMessage || 'Start the conversation and help me begin.'}`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      case 'vocabContext': {
        const language = String(payload.language || 'English');
        const word = String(payload.word || '');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are a vocabulary tutor for Chinese-speaking learners. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Define "${word}" for a student learning ${language}. Return JSON with definition, chineseDefinition, contextSentence, and contextSentenceZh. Keep the context sentence natural and useful, and make contextSentenceZh a short natural Chinese meaning of that example sentence.`,
            },
          ],
          true
        );
        return sendJson(res, 200, parseJson(content));
      }
      default:
        return sendJson(res, 400, { error: 'Unsupported action' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return sendJson(res, 500, { error: message });
  }
}

async function handleTtsRequest(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const text = String(body.text || '').trim();
    const voice = String(body.voice || TTS_MODEL_NAME).trim();

    if (!text) {
      return sendJson(res, 400, { error: 'Missing text for TTS' });
    }

    const audioBuffer = await synthesizeDashscopeSpeech(text, voice);
    return sendJson(res, 200, {
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/mpeg',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TTS error';
    return sendJson(res, 500, { error: message });
  }
}

async function handleAsrRequest(req, res) {
  let filePath = '';

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const audioBase64 = String(body.audioBase64 || '').trim();
    const language = String(body.language || 'English');

    if (!audioBase64) {
      return sendJson(res, 400, { error: 'Missing audioBase64 for ASR' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const upload = await saveUploadedAudio(audioBuffer);
    filePath = upload.filePath;

    const fileUrl = `${buildPublicOrigin(req)}/uploads/${upload.fileName}`;
    const taskId = await submitDashscopeAsrTask(fileUrl, getLanguageHint(language));
    const transcriptionUrl = await pollDashscopeAsrResult(taskId);
    const transcript = await fetchDashscopeTranscript(transcriptionUrl);

    return sendJson(res, 200, { transcript });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ASR error';
    return sendJson(res, 500, { error: message });
  } finally {
    if (filePath) {
      unlink(filePath).catch(() => {});
    }
  }
}

function getContentType(filePath) {
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/ai' && req.method === 'POST') {
    return handleAiRequest(req, res);
  }

  if (pathname === '/api/tts' && req.method === 'POST') {
    return handleTtsRequest(req, res);
  }

  if (pathname === '/api/asr' && req.method === 'POST') {
    return handleAsrRequest(req, res);
  }

  if (pathname === '/api/clipper/token' && req.method === 'POST') {
    return handleClipperTokenRequest(req, res);
  }

  if (pathname === '/api/clipper/import' && req.method === 'POST') {
    return handleClipperImportRequest(req, res);
  }

  if (pathname.startsWith('/uploads/')) {
    const filePath = path.join(uploadDir, path.basename(pathname));
    if (!filePath.startsWith(uploadDir) || !existsSync(filePath)) {
      return sendJson(res, 404, { error: 'Audio upload not found' });
    }
    return sendFile(res, filePath, 'audio/wav');
  }

  if (!existsSync(distDir)) {
    return sendJson(res, 500, { error: 'Build output not found. Run npm run build first.' });
  }

  let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(distDir)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  if (existsSync(filePath) && !filePath.endsWith('/')) {
    return sendFile(res, filePath, getContentType(filePath));
  }

  try {
    const indexPath = path.join(distDir, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`LinguaFlow server listening on ${port}`);
});
