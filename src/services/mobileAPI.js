/**
 * Download/MangaX Mobile API Layer
 * 
 * Capacitor-Native Implementation for Android/iOS WebView.
 */
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const BASE_URL = 'https://api.mangadex.org';
const UPLOADS_URL = 'https://uploads.mangadex.org';
const MANGADEX_USER_AGENT = 'MangaX/1.0 (Android; com.ahmad.mangax; +https://github.com/ahmadbhaqi/MangaX)';
export const DOWNLOAD_ROOT = 'MangaX';
export const DOWNLOAD_DIRECTORY = Directory.Documents;

export async function ensureDownloadPermission(
  filesystem = Filesystem,
  capacitor = Capacitor,
) {
  if (!capacitor.isNativePlatform()) return true;
  const current = await filesystem.checkPermissions();
  if (current.publicStorage === 'granted') return true;
  const requested = await filesystem.requestPermissions();
  if (requested.publicStorage !== 'granted') {
    throw new Error('Izin penyimpanan diperlukan untuk menyimpan chapter.');
  }
  return true;
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function buildUrl(base, apiPath, params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${key}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return `${base}${apiPath}?${parts.join('&')}`;
}

function getRelationship(relationships, type) {
  return (relationships || []).find(r => r.type === type);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').toLowerCase();
}

async function getMangaDexErrorDetail(response) {
  try {
    const payload = await response.json();
    const apiError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    const detail = apiError?.detail || apiError?.title || payload?.message;
    return typeof detail === 'string'
      ? detail.replace(/\s+/g, ' ').trim().slice(0, 240)
      : '';
  } catch (error) {
    void error;
    return '';
  }
}

async function apiFetch(url, { retries = 1, timeoutMs = 8000, baseDelayMs = 400 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    let timeout;
    let response;

    try {
      const request = fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': MANGADEX_USER_AGENT,
        },
        signal: controller.signal,
      });
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error('MangaDex request timed out');
          error.name = 'TimeoutError';
          reject(error);
        }, timeoutMs);
      });

      response = await Promise.race([request, deadline]);
    } catch (error) {
      if (attempt === retries) {
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
          throw new Error('MangaDex request timed out', { cause: error });
        }
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * (2 ** attempt)));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === retries) {
      const detail = await getMangaDexErrorDetail(response);
      throw new Error(
        `MangaDex request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const retryAfterHeader = response.headers?.get?.('retry-after');
    const retryAfter = retryAfterHeader?.trim() ? Number(retryAfterHeader) : Number.NaN;
    const waitMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : baseDelayMs * (2 ** attempt);
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  throw new Error('MangaDex request failed');
}

function createSeededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normalizedTags(manga) {
  return new Set((manga.tags || []).filter(Boolean).map(tag => tag.toLowerCase()));
}

function tagSimilarity(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach(tag => {
    if (right.has(tag)) intersection += 1;
  });
  return intersection / new Set([...left, ...right]).size;
}

export function selectDashboardRecommendations({
  candidates = [],
  library = [],
  recentIds = [],
  limit = 30,
  seed = Date.now(),
} = {}) {
  const random = createSeededRandom(seed);
  const recent = new Set(recentIds);
  const tagAffinity = new Map();

  library.forEach(manga => {
    normalizedTags(manga).forEach(tag => {
      tagAffinity.set(tag, (tagAffinity.get(tag) || 0) + 1);
    });
  });

  const unique = [...new Map(candidates.map(manga => [manga.id, manga])).values()]
    .filter(manga => manga?.id)
    .map(manga => ({
      manga,
      tags: normalizedTags(manga),
      exploration: random(),
    }));

  const unseen = unique.filter(item => !recent.has(item.manga.id));
  const pool = unseen.length >= Math.min(limit, unique.length) ? unseen : unique;
  const selected = [];
  const remaining = [...pool];

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((item, index) => {
      const affinity = [...item.tags].reduce(
        (score, tag) => score + (tagAffinity.get(tag) || 0),
        0,
      );
      const maxSimilarity = selected.reduce(
        (highest, picked) => Math.max(highest, tagSimilarity(item.tags, picked.tags)),
        0,
      );
      const authorRepeated = selected.some(
        picked => picked.manga.author && picked.manga.author === item.manga.author,
      );
      const novelty = recent.has(item.manga.id) ? -8 : 3;
      const score = (affinity * 2.4)
        + novelty
        + (item.exploration * 2.5)
        - (maxSimilarity * 4)
        - (authorRepeated ? 1.5 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.map(item => item.manga);
}

export async function getRecommendationHistory(storage = Preferences) {
  try {
    const { value } = await storage.get({ key: 'mangax_recommendation_history' });
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    void error;
    return [];
  }
}

export async function fetchDashboardRecommendations({
  library = [],
  recentIds,
  limit = 30,
  seed = Date.now(),
} = {}) {
  let history = recentIds;
  if (!Array.isArray(history)) {
    history = await getRecommendationHistory();
  }

  const random = createSeededRandom(seed);
  const availableTags = await getAllTags();
  const savedTagFrequency = new Map();

  library.forEach(manga => {
    (manga.tags || []).forEach(tag => {
      const normalized = tag?.toLowerCase();
      if (normalized) savedTagFrequency.set(normalized, (savedTagFrequency.get(normalized) || 0) + 1);
    });
  });

  const preferredTagIds = [...savedTagFrequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name]) => availableTags.find(tag => tag.name?.toLowerCase() === name)?.id)
    .filter(Boolean)
    .slice(0, 2);

  const poolLimit = Math.min(30, Math.max(12, Math.ceil(limit * 0.75)));
  const strategies = [
    {
      orderBy: 'followedCount',
      offset: Math.floor(random() * 360),
      tags: preferredTagIds.slice(0, 1),
      includedTagsMode: 'OR',
    },
    {
      orderBy: 'latestUploadedChapter',
      offset: Math.floor(random() * 180),
    },
    {
      orderBy: 'createdAt',
      offset: Math.floor(random() * 120),
    },
  ];

  const settled = await Promise.allSettled(
    strategies.map(strategy => fetchMangaList({
      ...strategy,
      availableTags,
      limit: poolLimit,
    })),
  );
  const candidates = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);

  if (candidates.length === 0) {
    const firstError = settled.find(result => result.status === 'rejected');
    if (firstError) throw firstError.reason;
  }

  const selected = selectDashboardRecommendations({
    candidates,
    library,
    recentIds: history,
    limit,
    seed,
  });
  return selected;
}

export function updateRecommendationHistory(current = [], shown = [], maxItems = 90) {
  return [...new Set([...shown, ...current])]
    .filter(Boolean)
    .slice(0, maxItems);
}

let recommendationHistoryWrite = Promise.resolve([]);
export function recordShownRecommendations(shownIds = [], storage = Preferences) {
  recommendationHistoryWrite = recommendationHistoryWrite
    .catch(() => [])
    .then(async () => {
      const current = await getRecommendationHistory(storage);

      const next = updateRecommendationHistory(current, shownIds);
      try {
        await storage.set({
          key: 'mangax_recommendation_history',
          value: JSON.stringify(next),
        });
      } catch (error) {
        void error;
      }
      return next;
    });

  return recommendationHistoryWrite;
}

// ──────────────────────────────────────────
// Settings & Library (Capacitor Preferences)
// ──────────────────────────────────────────
export async function getSettings() {
  try {
    const { value } = await Preferences.get({ key: 'mangax_settings' });
    if (value) return JSON.parse(value);
  } catch (e) { console.error('Settings load error:', e); }
  return { downloadPath: 'Documents/MangaX', quality: 'dataSaver' }; // Defaulting to dataSaver for mobile efficiency
}

export async function saveSettings(settings) {
  await Preferences.set({ key: 'mangax_settings', value: JSON.stringify(settings) });
  return true;
}

export async function getLibrary() {
  try {
    const { value } = await Preferences.get({ key: 'mangax_library' });
    if (value) return JSON.parse(value);
  } catch (e) { console.error('Library load error:', e); }
  return [];
}

async function saveLibraryData(library) {
  await Preferences.set({ key: 'mangax_library', value: JSON.stringify(library) });
}

export async function addToLibrary(manga) {
  const lib = await getLibrary();
  if (!lib.find(m => m.id === manga.id)) {
    manga.addedAt = new Date().toISOString();
    lib.unshift(manga);
    await saveLibraryData(lib);
  }
  return lib;
}

export async function removeFromLibrary(mangaId) {
  let lib = await getLibrary();
  lib = lib.filter(m => m.id !== mangaId);
  await saveLibraryData(lib);
  return lib;
}

export async function isInLibrary(mangaId) {
  const lib = await getLibrary();
  return !!lib.find(m => m.id === mangaId);
}

// ──────────────────────────────────────────
// MangaDex API Calls
// ──────────────────────────────────────────
export async function fetchMangaList(options = {}) {
  try {
    // Always exclude Boys' Love and Girls' Love
    const tags = Array.isArray(options.availableTags) ? options.availableTags : await getAllTags();
    const excludedTagIds = [];
    const blTag = tags.find(t => t.name === "Boys' Love");
    const glTag = tags.find(t => t.name === "Girls' Love");
    if (blTag) excludedTagIds.push(blTag.id);
    if (glTag) excludedTagIds.push(glTag.id);

    const params = {
      limit: String(Math.min(100, Math.max(1, options.limit || 30))),
      'includes[]': ['cover_art', 'author'],
    };

    // Content rating based on options.contentRatings
    if (options.contentRatings && options.contentRatings.length > 0) {
      params['contentRating[]'] = options.contentRatings;
    } else {
      params['contentRating[]'] = ['safe', 'suggestive'];
    }

    if (options.query) params.title = options.query;
    else params[`order[${options.orderBy || 'followedCount'}]`] = options.orderDirection || 'desc';

    if (options.hasAvailableChapters !== false) params.hasAvailableChapters = 'true';
    if (options.status) params['status[]'] = options.status;
    if (options.demographic) params['publicationDemographic[]'] = options.demographic;
    if (options.originalLanguage) params['originalLanguage[]'] = options.originalLanguage;
    if (options.tags && options.tags.length > 0) params['includedTags[]'] = options.tags;
    if (options.includedTagsMode) params.includedTagsMode = options.includedTagsMode;
    if (options.offset) params.offset = String(options.offset);
    if (excludedTagIds.length > 0) params['excludedTags[]'] = excludedTagIds;

    const url = buildUrl(BASE_URL, '/manga', params);
    const res = await apiFetch(url, { retries: 0 });
    const json = await res.json();
    if (!json.data) return [];

    return json.data.filter(manga => {
      const tags = manga.attributes.tags || [];
      return !tags.some(t => {
        const name = t.attributes.name.en || '';
        return name === "Boys' Love" || name === "Girls' Love";
      });
    }).map(manga => {
      const coverArt = getRelationship(manga.relationships, 'cover_art');
      const author = getRelationship(manga.relationships, 'author');

      let coverUrl = '';
      if (coverArt?.attributes?.fileName) {
        coverUrl = `${UPLOADS_URL}/covers/${manga.id}/${coverArt.attributes.fileName}.256.jpg`;
      }

      const title = manga.attributes.title?.en ||
        (manga.attributes.title ? Object.values(manga.attributes.title)[0] : 'Unknown Title');
      const authorName = author?.attributes?.name || 'Unknown Author';

      return {
        id: manga.id,
        title,
        author: authorName,
        cover: coverUrl,
        status: manga.attributes.status || 'Unknown',
        description: manga.attributes.description?.en || '',
        tags: manga.attributes.tags ? manga.attributes.tags.map(t => t.attributes.name.en) : []
      };
    });
  } catch (error) {
    console.error('Error fetching manga list:', error);
    throw error;
  }
}

let allTagsCache = null;
export async function getAllTags() {
  if (allTagsCache) return allTagsCache;
  try {
    const res = await apiFetch(`${BASE_URL}/manga/tag`, { retries: 0, timeoutMs: 4000 });
    const json = await res.json();
    if (!json.data) return [];
    allTagsCache = json.data.map(t => ({ id: t.id, name: t.attributes.name.en, group: t.attributes.group }));
    return allTagsCache;
  } catch (e) {
    console.error('Error fetching tags:', e);
    return [];
  }
}

export async function fetchTags() {
  const tags = await getAllTags();
  return tags.filter(t => t.name !== "Boys' Love" && t.name !== "Girls' Love");
}

export async function fetchMangaChapters(mangaId, onProgress, requestOptions = {}) {
  try {
    const LIMIT = 100;
    let offset = 0;
    let allChapters = [];
    const seenChapterIds = new Set();
    let total = Infinity;

    while (offset < total) {
      const url = buildUrl(BASE_URL, `/manga/${mangaId}/feed`, {
        limit: String(LIMIT),
        offset: String(offset),
        'contentRating[]': ['safe', 'suggestive', 'erotica', 'pornographic'],
        'order[chapter]': 'desc',
        'includes[]': ['scanlation_group'],
      });

      const res = await apiFetch(url, {
        retries: requestOptions.retries,
        timeoutMs: requestOptions.requestTimeoutMs,
        baseDelayMs: requestOptions.retryDelayMs,
      });
      const json = await res.json();
      if (!json.data) break;

      total = Number.isFinite(json.total) ? json.total : json.data.length;

      const mapped = json.data.map(chapter => {
        const group = getRelationship(chapter.relationships, 'scanlation_group');
        return {
          id: chapter.id,
          chapter: chapter.attributes.chapter || 'Oneshot',
          title: chapter.attributes.title || '',
          language: chapter.attributes.translatedLanguage,
          pages: chapter.attributes.pages || 0,
          group: group?.attributes?.name || 'No Group',
          publishAt: new Date(chapter.attributes.publishAt).toLocaleDateString(),
        };
      });

      mapped.forEach(chapter => {
        if (!seenChapterIds.has(chapter.id)) {
          seenChapterIds.add(chapter.id);
          allChapters.push(chapter);
        }
      });
      const responseOffset = Number.isFinite(json.offset) ? json.offset : offset;
      const responseLimit = Number.isFinite(json.limit) && json.limit > 0
        ? json.limit
        : (json.data.length || LIMIT);
      const nextOffset = responseOffset + responseLimit;
      if (json.data.length === 0 || nextOffset <= offset) break;
      offset = nextOffset;

      if (onProgress) onProgress({ fetched: allChapters.length, total });

      if (offset < total) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return allChapters;
  } catch (error) {
    console.error('Error fetching chapters:', error);
    throw error;
  }
}

export async function fetchChapterPages({ chapterId, quality = 'dataSaver' }) {
  try {
    const res = await apiFetch(`${BASE_URL}/at-home/server/${chapterId}`);
    const json = await res.json();
    if (!json.chapter) return [];

    const baseUrl = json.baseUrl;
    const hash = json.chapter.hash;
    const saverFiles = Array.isArray(json.chapter.dataSaver) ? json.chapter.dataSaver : [];
    const originalFiles = Array.isArray(json.chapter.data) ? json.chapter.data : [];
    const useDataSaver = quality === 'dataSaver' && saverFiles.length > 0;
    const files = useDataSaver ? saverFiles : originalFiles;
    const folder = useDataSaver ? 'data-saver' : 'data';

    return files.map(f => `${baseUrl}/${folder}/${hash}/${f}`);
  } catch (error) {
    console.error('Error fetching chapter pages:', error);
    throw error;
  }
}

// ──────────────────────────────────────────
// Optimize PDF Download & Creation
// ──────────────────────────────────────────
export async function downloadChapter({ mangaTitle, chapterTitle, pages }, onProgress) {
  try {
    await ensureDownloadPermission();
    const { PDFDocument } = await import('pdf-lib');
    const mangaDir = sanitizeFilename(mangaTitle);
    const pdfName = `${sanitizeFilename(chapterTitle)}.pdf`;
    
    // Create hidden directory for native offline reading
    const hiddenDir = `${DOWNLOAD_ROOT}/${mangaDir}/.${sanitizeFilename(chapterTitle)}_images`;
    try {
      await Filesystem.mkdir({ path: hiddenDir, directory: DOWNLOAD_DIRECTORY, recursive: true });
    } catch (error) {
      void error;
    }

    // Build PDF iteratively to save RAM
    const pdfDoc = await PDFDocument.create();
    let completed = 0;

    // Process in smaller batches to balance speed and memory
    const BATCH_SIZE = 2;
    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batchUrls = pages.slice(i, i + BATCH_SIZE);

      // Download batch
      const buffers = await Promise.all(batchUrls.map(async (url) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const arrayBuf = await blob.arrayBuffer();
          return new Uint8Array(arrayBuf);
        } catch (e) {
          console.error(`Page download failed:`, e.message);
          return null;
        }
      }));

      // Embed batch into PDF and free memory immediately
      for (let j = 0; j < buffers.length; j++) {
        const buf = buffers[j];
        if (!buf) {
          completed++;
          continue;
        }
        
        // Save image to hidden folder for offline native reading
        try {
          let imgBinary = '';
          const IMG_CHUNK_SIZE = 8192;
          for (let k = 0; k < buf.length; k += IMG_CHUNK_SIZE) {
            imgBinary += String.fromCharCode.apply(null, buf.subarray(k, k + IMG_CHUNK_SIZE));
          }
          await Filesystem.writeFile({
            path: `${hiddenDir}/${i + j}.jpg`,
            data: btoa(imgBinary),
            directory: DOWNLOAD_DIRECTORY
          });
        } catch(e) { console.error('Failed saving hidden image', e); }

        try {
          let image;
          if (buf[0] === 0xFF && buf[1] === 0xD8) {
            image = await pdfDoc.embedJpg(buf);
          } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
            image = await pdfDoc.embedPng(buf);
          } else {
            try { image = await pdfDoc.embedJpg(buf); }
            catch { image = await pdfDoc.embedPng(buf); }
          }

          const { width, height } = image.scale(1);
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(image, { x: 0, y: 0, width, height });
        } catch (err) {
          console.error(`Error embedding page:`, err.message);
        }

        completed++;
        if (onProgress) onProgress({ chapterTitle, progress: completed, total: pages.length });
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Fix: Convert to base64 in chunks to prevent "maximum call stack size exceeded"
    let binary = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < pdfBytes.length; i += CHUNK_SIZE) {
      const chunk = pdfBytes.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);

    // Ensure directory exists and write file
    try {
      await Filesystem.mkdir({
        path: `${DOWNLOAD_ROOT}/${mangaDir}`,
        directory: DOWNLOAD_DIRECTORY,
        recursive: true,
      });
    } catch (error) {
      void error;
    }

    await Filesystem.writeFile({
      path: `${DOWNLOAD_ROOT}/${mangaDir}/${pdfName}`,
      data: base64,
      directory: DOWNLOAD_DIRECTORY,
    });

    return { success: true, path: `${DOWNLOAD_ROOT}/${mangaDir}/${pdfName}` };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDownloads() {
  try {
    await ensureDownloadPermission();
    const result = await Filesystem.readdir({
      path: DOWNLOAD_ROOT,
      directory: DOWNLOAD_DIRECTORY,
    });

    const downloads = [];
    for (const entry of result.files) {
      if (entry.type === 'directory') {
        try {
          const chaptersResult = await Filesystem.readdir({
            path: `${DOWNLOAD_ROOT}/${entry.name}`,
            directory: DOWNLOAD_DIRECTORY,
          });

          const chapters = chaptersResult.files
            .filter(f => f.name.endsWith('.pdf'))
            .map(f => ({
              name: f.name.replace('.pdf', ''),
              path: `${DOWNLOAD_ROOT}/${entry.name}/${f.name}`,
              size: f.size || 0,
            }));

          if (chapters.length > 0) {
            downloads.push({
              name: entry.name,
              path: `${DOWNLOAD_ROOT}/${entry.name}`,
              chapters,
              totalSize: chapters.reduce((sum, c) => sum + (c.size || 0), 0),
            });
          }
        } catch (error) {
          void error;
        }
      }
    }
    return downloads;
  } catch (e) {
    console.error('Error scanning downloads:', e);
    return [];
  }
}

export async function getOfflinePages(mangaTitle, chapterTitle) {
  try {
    await ensureDownloadPermission();
    const mangaDir = sanitizeFilename(mangaTitle);
    const hiddenDir = `${DOWNLOAD_ROOT}/${mangaDir}/.${sanitizeFilename(chapterTitle)}_images`;
    
    const result = await Filesystem.readdir({
      path: hiddenDir,
      directory: DOWNLOAD_DIRECTORY
    });

    const files = result.files
      .filter(f => f.name.endsWith('.jpg'))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));

    const pages = [];
    for (const f of files) {
      const uri = await Filesystem.getUri({
        path: `${hiddenDir}/${f.name}`,
        directory: DOWNLOAD_DIRECTORY
      });
      pages.push(Capacitor.convertFileSrc(uri.uri));
    }
    return pages;
  } catch(e) {
    console.error('Error reading offline pages:', e);
    return [];
  }
}

export async function openFolder(filePath) {
  try {
    await ensureDownloadPermission();
    const file = await Filesystem.readFile({
      path: filePath,
      directory: DOWNLOAD_DIRECTORY,
    });
    const byteCharacters = atob(file.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return true;
  } catch (e) {
    console.error('Open file error:', e);
    return false;
  }
}

// ──────────────────────────────────────────
// LRU Cache for Proxy Image
// ──────────────────────────────────────────
const imageCache = new Map();
const MAX_CACHE_SIZE = 50;

export async function proxyImage(imageUrl) {
  if (!imageUrl) return null;
  if (imageCache.has(imageUrl)) {
    const val = imageCache.get(imageUrl);
    imageCache.delete(imageUrl);
    imageCache.set(imageUrl, val);
    return val;
  }

  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result;

        if (imageCache.size >= MAX_CACHE_SIZE) {
          const firstKey = imageCache.keys().next().value;
          imageCache.delete(firstKey);
        }

        imageCache.set(imageUrl, dataUri);
        resolve(dataUri);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Image proxy error:', e);
    return null;
  }
}
