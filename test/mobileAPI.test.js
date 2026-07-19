import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import * as api from '../src/services/mobileAPI.js'

const originalFetch = globalThis.fetch

test('downloads use scoped Documents storage instead of all-files external storage', () => {
  assert.equal(api.DOWNLOAD_DIRECTORY, 'DOCUMENTS')
  assert.equal(api.DOWNLOAD_ROOT, 'MangaX')
})

test('legacy public storage permission is requested only when native access is not granted', async () => {
  let requested = 0
  const filesystem = {
    async checkPermissions() {
      return { publicStorage: 'prompt' }
    },
    async requestPermissions() {
      requested += 1
      return { publicStorage: 'granted' }
    },
  }

  await api.ensureDownloadPermission(filesystem, { isNativePlatform: () => true })
  assert.equal(requested, 1)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function chapter(id, number, language = 'en') {
  return {
    id,
    attributes: {
      chapter: number,
      title: '',
      translatedLanguage: language,
      pages: 20,
      publishAt: '2026-07-01T00:00:00+00:00',
    },
    relationships: [],
  }
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null
      },
    },
    async json() {
      return body
    },
  }
}

test('fetchMangaChapters follows server pagination metadata until every chapter is collected', async () => {
  const requestedOffsets = []

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl)
    const offset = Number(url.searchParams.get('offset'))
    requestedOffsets.push(offset)

    if (offset === 0) {
      return jsonResponse({
        data: [chapter('chapter-a', '3'), chapter('chapter-b', '2')],
        limit: 2,
        offset: 0,
        total: 3,
      })
    }

    return jsonResponse({
      data: [chapter('chapter-c', '1')],
      limit: 2,
      offset: 2,
      total: 3,
    })
  }

  const chapters = await api.fetchMangaChapters('manga-id')

  assert.deepEqual(requestedOffsets, [0, 2])
  assert.deepEqual(chapters.map((item) => item.id), ['chapter-a', 'chapter-b', 'chapter-c'])
})

test('fetchMangaChapters retries a rate-limited request instead of returning an empty list', async () => {
  let attempts = 0

  globalThis.fetch = async () => {
    attempts += 1
    if (attempts === 1) {
      return jsonResponse(
        { errors: [{ detail: 'Too many requests' }] },
        { status: 429, headers: { 'retry-after': '0' } },
      )
    }

    return jsonResponse({
      data: [chapter('chapter-a', '1')],
      limit: 100,
      offset: 0,
      total: 1,
    })
  }

  const chapters = await api.fetchMangaChapters('manga-id')

  assert.equal(attempts, 2)
  assert.equal(chapters.length, 1)
})

test('rate-limit retries use backoff when Retry-After is missing', async () => {
  let attempts = 0
  const startedAt = Date.now()

  globalThis.fetch = async () => {
    attempts += 1
    if (attempts === 1) {
      return jsonResponse({ errors: [{ detail: 'Busy' }] }, { status: 429 })
    }

    return jsonResponse({
      data: [chapter('chapter-after-wait', '1')],
      limit: 100,
      offset: 0,
      total: 1,
    })
  }

  await api.fetchMangaChapters('manga-id', null, { retryDelayMs: 20 })

  assert.equal(attempts, 2)
  assert.ok(Date.now() - startedAt >= 15)
})

test('fetchMangaChapters discovers existing chapters without hard-coded language query filters', async () => {
  let requestedLanguages = null
  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl)
    requestedLanguages = url.searchParams.getAll('translatedLanguage[]')
    return jsonResponse({
      data: [chapter('chapter-ja', '1', 'ja')],
      limit: 100,
      offset: 0,
      total: 1,
    })
  }

  const chapters = await api.fetchMangaChapters('manga-id')

  assert.deepEqual(requestedLanguages, [])
  assert.equal(chapters[0].language, 'ja')
})

test('fetchMangaChapters removes duplicate chapters when a changing feed overlaps pages', async () => {
  globalThis.fetch = async (requestUrl) => {
    const offset = Number(new URL(requestUrl).searchParams.get('offset'))
    return offset === 0
      ? jsonResponse({
          data: [chapter('chapter-a', '3'), chapter('chapter-b', '2')],
          limit: 2,
          offset: 0,
          total: 3,
        })
      : jsonResponse({
          data: [chapter('chapter-b', '2'), chapter('chapter-c', '1')],
          limit: 2,
          offset: 2,
          total: 3,
        })
  }

  const chapters = await api.fetchMangaChapters('manga-id')

  assert.deepEqual(chapters.map((item) => item.id), ['chapter-a', 'chapter-b', 'chapter-c'])
})

test('fetchChapterPages falls back to original files when data saver files are unavailable', async () => {
  globalThis.fetch = async () => jsonResponse({
    baseUrl: 'https://uploads.example',
    chapter: {
      hash: 'hash',
      data: ['001.png'],
      dataSaver: [],
    },
  })

  const pages = await api.fetchChapterPages({ chapterId: 'chapter-id', quality: 'dataSaver' })

  assert.deepEqual(pages, ['https://uploads.example/data/hash/001.png'])
})

test('fetchMangaChapters surfaces terminal API errors to the interface', async () => {
  globalThis.fetch = async () => jsonResponse(
    { errors: [{ detail: 'Chapter not found' }] },
    { status: 404 },
  )

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    await assert.rejects(
      api.fetchMangaChapters('missing-manga'),
      /MangaDex request failed \(404\)/,
    )
  } finally {
    console.error = originalConsoleError
  }
})

test('MangaDex requests identify MangaX instead of using an anonymous native client', async () => {
  let requestHeaders

  globalThis.fetch = async (_requestUrl, options = {}) => {
    requestHeaders = options.headers
    return jsonResponse({
      data: [],
      limit: 100,
      offset: 0,
      total: 0,
    })
  }

  await api.fetchMangaChapters('manga-id')

  assert.match(requestHeaders?.['User-Agent'] || '', /^MangaX\/1\.0 /)
  assert.match(requestHeaders?.['User-Agent'] || '', /github\.com\/ahmadbhaqi\/MangaX/)
})

test('MangaDex request errors include the server detail needed to diagnose HTTP 400', async () => {
  globalThis.fetch = async () => jsonResponse(
    { errors: [{ title: 'Bad Request', detail: 'Missing or unsupported User-Agent' }] },
    { status: 400 },
  )

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    await assert.rejects(
      api.fetchMangaChapters('manga-id'),
      /MangaDex request failed \(400\): Missing or unsupported User-Agent/,
    )
  } finally {
    console.error = originalConsoleError
  }
})

test('fetchMangaChapters aborts a request that exceeds its timeout', async () => {
  globalThis.fetch = async (_requestUrl, options = {}) => new Promise((resolve, reject) => {
    void resolve
    options.signal?.addEventListener('abort', () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      reject(error)
    })
  })

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const result = await Promise.race([
      api.fetchMangaChapters('slow-manga', null, { requestTimeoutMs: 5, retries: 0 })
        .catch(error => error),
      new Promise(resolve => setTimeout(() => resolve(null), 60)),
    ])

    assert.match(result?.message || '', /timed out/i)
  } finally {
    console.error = originalConsoleError
  }
})

test('fetch timeout still resolves when the native transport ignores AbortSignal', async () => {
  globalThis.fetch = async () => new Promise(() => {})

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const result = await Promise.race([
      api.fetchMangaChapters('stuck-native-transport', null, { requestTimeoutMs: 5, retries: 0 })
        .catch(error => error),
      new Promise(resolve => setTimeout(() => resolve(null), 60)),
    ])

    assert.match(result?.message || '', /timed out/i)
  } finally {
    console.error = originalConsoleError
  }
})

test('fetchMangaList surfaces API failures instead of disguising them as an empty catalog', async () => {
  globalThis.fetch = async () => jsonResponse(
    { errors: [{ detail: 'Unavailable' }] },
    { status: 404 },
  )

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    await assert.rejects(api.fetchMangaList(), /MangaDex request failed \(404\)/)
  } finally {
    console.error = originalConsoleError
  }
})

test('mobile API exposes a dashboard recommendation selector', () => {
  assert.equal(typeof api.selectDashboardRecommendations, 'function')
})

test('mobile API exposes a dashboard recommendation fetcher', () => {
  assert.equal(typeof api.fetchDashboardRecommendations, 'function')
})

test('mobile API exposes recommendation history rotation', () => {
  assert.equal(typeof api.updateRecommendationHistory, 'function')
  assert.equal(typeof api.getRecommendationHistory, 'function')
})

test('getRecommendationHistory normalizes malformed persisted values', async () => {
  const storage = {
    async get() {
      return { value: JSON.stringify({ invalid: true }) }
    },
  }

  assert.deepEqual(await api.getRecommendationHistory(storage), [])
})

test('updateRecommendationHistory puts newly shown manga first and removes duplicates', () => {
  assert.deepEqual(
    api.updateRecommendationHistory(['old-a', 'repeat', 'old-b'], ['new-a', 'repeat'], 4),
    ['new-a', 'repeat', 'old-a', 'old-b'],
  )
})

test('recordShownRecommendations validates malformed history and serializes overlapping writes', async () => {
  let storedValue = JSON.stringify({ invalid: true })
  const storage = {
    async get() {
      return { value: storedValue }
    },
    async set({ value }) {
      await new Promise(resolve => setTimeout(resolve, 2))
      storedValue = value
    },
  }

  await Promise.all([
    api.recordShownRecommendations(['shown-a'], storage),
    api.recordShownRecommendations(['shown-b'], storage),
  ])

  assert.deepEqual(JSON.parse(storedValue), ['shown-b', 'shown-a'])
})

test('fetchDashboardRecommendations blends multiple discovery pools and personal tags', async () => {
  const orderKeys = []
  const includedTagIds = []

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl)
    if (url.pathname === '/manga/tag') {
      return jsonResponse({
        data: [
          { id: 'action-id', attributes: { name: { en: 'Action' }, group: 'genre' } },
          { id: 'fantasy-id', attributes: { name: { en: 'Fantasy' }, group: 'genre' } },
        ],
      })
    }

    const orderKey = [...url.searchParams.keys()].find((key) => key.startsWith('order['))
    orderKeys.push(orderKey)
    includedTagIds.push(...url.searchParams.getAll('includedTags[]'))
    const poolName = orderKey.replace(/[^a-z]/gi, '')

    return jsonResponse({
      data: Array.from({ length: 4 }, (_, index) => ({
        id: `${poolName}-${index}`,
        attributes: {
          title: { en: `${poolName} ${index}` },
          status: 'ongoing',
          description: { en: 'Description' },
          tags: [{ attributes: { name: { en: index % 2 === 0 ? 'Action' : 'Fantasy' } } }],
        },
        relationships: [],
      })),
    })
  }

  const result = await api.fetchDashboardRecommendations({
    library: [{ id: 'saved', tags: ['Action'] }],
    recentIds: ['orderfollowedCount-0'],
    limit: 6,
    seed: 73,
  })

  assert.ok(new Set(orderKeys).size >= 3)
  assert.ok(includedTagIds.includes('action-id'))
  assert.equal(result.length, 6)
  assert.equal(new Set(result.map((item) => item.id)).size, 6)
  assert.equal(result.some((item) => item.id === 'orderfollowedCount-0'), false)
})

test('selectDashboardRecommendations favors library affinity without repeating one genre cluster', () => {
  const candidates = [
    { id: 'a', title: 'A', author: 'One', tags: ['Action', 'Fantasy'] },
    { id: 'b', title: 'B', author: 'One', tags: ['Action', 'Fantasy'] },
    { id: 'c', title: 'C', author: 'Two', tags: ['Romance', 'Drama'] },
    { id: 'd', title: 'D', author: 'Three', tags: ['Mystery'] },
    { id: 'e', title: 'E', author: 'Four', tags: ['Action'] },
    { id: 'f', title: 'F', author: 'Five', tags: ['Sci-Fi'] },
  ]

  const result = api.selectDashboardRecommendations({
    candidates,
    library: [{ id: 'saved', tags: ['Action', 'Fantasy'] }],
    recentIds: ['a'],
    limit: 4,
    seed: 17,
  })

  assert.equal(result.length, 4)
  assert.equal(new Set(result.map((item) => item.id)).size, 4)
  assert.equal(result.some((item) => item.id === 'a'), false)
  assert.equal(result.some((item) => item.id === 'b' || item.id === 'e'), true)
  assert.ok(new Set(result.flatMap((item) => item.tags)).size >= 4)
})

test('selectDashboardRecommendations changes exploration order when the seed changes', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    id: `manga-${index}`,
    title: `Manga ${index}`,
    author: `Author ${index}`,
    tags: [`Genre ${index % 5}`],
  }))

  const first = api.selectDashboardRecommendations({ candidates, limit: 8, seed: 11 })
  const second = api.selectDashboardRecommendations({ candidates, limit: 8, seed: 29 })

  assert.notDeepEqual(first.map((item) => item.id), second.map((item) => item.id))
})
