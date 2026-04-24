/**
 * Download/MangaX Mobile API Layer
 * 
 * Capacitor-Native Implementation for Android/iOS WebView.
 */
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { PDFDocument } from 'pdf-lib';

const BASE_URL = 'https://api.mangadex.org';
const UPLOADS_URL = 'https://uploads.mangadex.org';

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

async function apiFetch(url) {
  return fetch(url, { headers: { 'User-Agent': 'Download/MangaXMobile/2.0' } });
}

// ──────────────────────────────────────────
// Settings & Library (Capacitor Preferences)
// ──────────────────────────────────────────
export async function getSettings() {
  try {
    const { value } = await Preferences.get({ key: 'mangax_settings' });
    if (value) return JSON.parse(value);
  } catch (e) { console.error('Settings load error:', e); }
  return { downloadPath: 'Download/MangaX', quality: 'dataSaver', goonerMode: false };
}

// MangaDex tag IDs for Gooner Mode blacklist
export const GOONER_BLACKLIST_TAG_IDS = [
  '423e2eae-a7a2-4a8b-ac03-a8351462d71d', // Boys' Love
  'a3c67850-4684-404e-9b7f-c69850ee5da6', // Girls' Love
];

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
    const params = {
      limit: '30',
      'includes[]': ['cover_art', 'author'],
      'contentRating[]': ['safe', 'suggestive'],
    };

    if (options.query) {
      params.title = options.query;
    } else {
      params['order[followedCount]'] = 'desc';
      // Randomize offset for fresh recommendations on refresh
      if (options.offset && options.offset > 0) {
        params.offset = String(options.offset);
      }
    }

    if (options.hasAvailableChapters !== false) params.hasAvailableChapters = 'true';
    if (options.status) params['status[]'] = options.status;
    if (options.demographic) params['publicationDemographic[]'] = options.demographic;
    if (options.tags && options.tags.length > 0) params['includedTags[]'] = options.tags;

    // Gooner Mode: blacklist Boys' Love and Girls' Love
    if (options.goonerMode) {
      params['excludedTags[]'] = GOONER_BLACKLIST_TAG_IDS;
      params['excludedTagsMode'] = 'OR';
    }

    const url = buildUrl(BASE_URL, '/manga', params);
    const res = await apiFetch(url);
    const json = await res.json();
    if (!json.data) return [];

    return json.data.map(manga => {
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
        tags: manga.attributes.tags ? manga.attributes.tags.map(t => t.attributes.name.en) : [],
        tagIds: manga.attributes.tags ? manga.attributes.tags.map(t => t.id) : [],
      };
    });
  } catch (error) {
    console.error('Error fetching manga list:', error);
    return [];
  }
}

let cachedTags = null;
export async function fetchTags() {
  if (cachedTags) return cachedTags;
  try {
    const res = await apiFetch(`${BASE_URL}/manga/tag`);
    const json = await res.json();
    if (!json.data) return [];
    cachedTags = json.data.map(t => ({ id: t.id, name: t.attributes.name.en, group: t.attributes.group }));
    return cachedTags;
  } catch (e) {
    console.error('Error fetching tags:', e);
    return [];
  }
}

export async function fetchMangaChapters(mangaId, onProgress) {
  try {
    const LIMIT = 500;
    let offset = 0;
    let allChapters = [];
    let total = Infinity;

    while (offset < total) {
      const url = buildUrl(BASE_URL, `/manga/${mangaId}/feed`, {
        limit: String(LIMIT),
        offset: String(offset),
        'translatedLanguage[]': ['en', 'id'],
        'order[chapter]': 'desc',
        'includes[]': ['scanlation_group'],
      });

      const res = await apiFetch(url);
      const json = await res.json();
      if (!json.data) break;

      total = json.total || json.data.length;

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

      allChapters = allChapters.concat(mapped);
      offset += LIMIT;

      if (onProgress) onProgress({ fetched: allChapters.length, total });

      if (offset < total) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return allChapters;
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return [];
  }
}

export async function fetchChapterPages({ chapterId, quality = 'dataSaver' }) {
  try {
    const res = await apiFetch(`${BASE_URL}/at-home/server/${chapterId}`);
    const json = await res.json();
    if (!json.chapter) return [];

    const baseUrl = json.baseUrl;
    const hash = json.chapter.hash;
    const files = quality === 'dataSaver' ? json.chapter.dataSaver : json.chapter.data;
    const folder = quality === 'dataSaver' ? 'data-saver' : 'data';

    return files.map(f => `${baseUrl}/${folder}/${hash}/${f}`);
  } catch (error) {
    console.error('Error fetching chapter pages:', error);
    return [];
  }
}

// ──────────────────────────────────────────
// Optimize PDF Download & Creation
// ──────────────────────────────────────────
export async function downloadChapter({ mangaTitle, chapterTitle, pages }, onProgress) {
  try {
    const mangaDir = sanitizeFilename(mangaTitle);
    const pdfName = `${sanitizeFilename(chapterTitle)}.pdf`;
    
    // Create hidden directory for native offline reading
    const hiddenDir = `Download/MangaX/${mangaDir}/.${sanitizeFilename(chapterTitle)}_images`;
    try {
      await Filesystem.mkdir({ path: hiddenDir, directory: Directory.ExternalStorage, recursive: true });
    } catch(e) {}

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
            directory: Directory.ExternalStorage
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
        path: `Download/MangaX/${mangaDir}`,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
    } catch (e) { /* directory may already exist */ }

    await Filesystem.writeFile({
      path: `Download/MangaX/${mangaDir}/${pdfName}`,
      data: base64,
      directory: Directory.ExternalStorage,
    });

    return { success: true, path: `Download/MangaX/${mangaDir}/${pdfName}` };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDownloads() {
  try {
    const result = await Filesystem.readdir({
      path: 'Download/MangaX',
      directory: Directory.ExternalStorage,
    });

    const downloads = [];
    for (const entry of result.files) {
      if (entry.type === 'directory') {
        try {
          const chaptersResult = await Filesystem.readdir({
            path: `Download/MangaX/${entry.name}`,
            directory: Directory.ExternalStorage,
          });

          const chapters = chaptersResult.files
            .filter(f => f.name.endsWith('.pdf'))
            .map(f => ({
              name: f.name.replace('.pdf', ''),
              path: `Download/MangaX/${entry.name}/${f.name}`,
              size: f.size || 0,
            }));

          if (chapters.length > 0) {
            downloads.push({
              name: entry.name,
              path: `Download/MangaX/${entry.name}`,
              chapters,
              totalSize: chapters.reduce((sum, c) => sum + (c.size || 0), 0),
            });
          }
        } catch (e) { /* skip unreadable dirs */ }
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
    const mangaDir = sanitizeFilename(mangaTitle);
    const hiddenDir = `Download/MangaX/${mangaDir}/.${sanitizeFilename(chapterTitle)}_images`;
    
    const result = await Filesystem.readdir({
      path: hiddenDir,
      directory: Directory.ExternalStorage
    });

    const files = result.files
      .filter(f => f.name.endsWith('.jpg'))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));

    const pages = [];
    for (const f of files) {
      const uri = await Filesystem.getUri({
        path: `${hiddenDir}/${f.name}`,
        directory: Directory.ExternalStorage
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
    const file = await Filesystem.readFile({
      path: filePath,
      directory: Directory.ExternalStorage,
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
