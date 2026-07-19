import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  FileDown,
  Filter,
  FolderOpen,
  HardDrive,
  Heart,
  House,
  Image,
  Languages,
  Library,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { App as CapacitorApp } from '@capacitor/app'
import * as api from './services/mobileAPI'

const LANGUAGE_NAMES = {
  en: 'English',
  id: 'Indonesia',
  ja: '日本語',
  ko: '한국어',
  'zh-hk': '中文（繁體）',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  ru: 'Русский',
}

const NAV_ITEMS = [
  { id: 'discover', label: 'Beranda', icon: House },
  { id: 'library', label: 'Koleksi', icon: Library },
  { id: 'downloads', label: 'Unduhan', icon: Download },
  { id: 'settings', label: 'Setelan', icon: Settings },
]

function languageName(code) {
  return LANGUAGE_NAMES[code] || code?.toUpperCase() || 'Unknown'
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function ImageWithFallback({ src, alt, className = '', eager = false }) {
  const [resolved, setResolved] = useState({ source: null, value: null })

  useEffect(() => {
    if (!src) return undefined
    let cancelled = false
    api.proxyImage(src)
      .then(value => {
        if (!cancelled) setResolved({ source: src, value })
      })
      .catch(() => {
        if (!cancelled) setResolved({ source: src, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (src && resolved.source !== src) {
    return (
      <div className={`image-fallback image-loading ${className}`} aria-label={`Memuat ${alt}`}>
        <LoaderCircle aria-hidden="true" />
      </div>
    )
  }

  if (!resolved.value) {
    return (
      <div className={`image-fallback ${className}`} aria-label={alt}>
        <span>{(alt || '?').slice(0, 1).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <img
      src={resolved.value}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
    />
  )
}

function MangaCard({ manga, onSelect, index = 0 }) {
  return (
    <button className="manga-card" onClick={() => onSelect(manga)} type="button">
      <span className="manga-card-index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="manga-card-cover-wrap">
        <ImageWithFallback src={manga.cover} alt={manga.title} className="manga-card-cover" />
        <span className="manga-card-status">{manga.status || 'unknown'}</span>
      </div>
      <span className="manga-card-copy">
        <strong>{manga.title}</strong>
        <small>{manga.author}</small>
      </span>
    </button>
  )
}

function EmptyState({ icon: Icon, title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && (
        <button className="button button-primary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="manga-grid" aria-label="Memuat rekomendasi">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="manga-skeleton" key={index}>
          <div className="skeleton-cover" />
          <div className="skeleton-line skeleton-line-wide" />
          <div className="skeleton-line" />
        </div>
      ))}
    </div>
  )
}

function Reader({
  chapter,
  mangaTitle,
  pages,
  loading,
  error,
  controlsVisible,
  hasOlder,
  hasNewer,
  onClose,
  onOlder,
  onNewer,
  onToggleControls,
}) {
  return (
    <div className="reader" onClick={onToggleControls}>
      <header className={`reader-toolbar ${controlsVisible ? 'is-visible' : ''}`} onClick={event => event.stopPropagation()}>
        <button className="icon-button reader-close" onClick={onClose} type="button" aria-label="Tutup reader">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="reader-heading">
          <small>{mangaTitle}</small>
          <strong>{chapter.isOffline ? chapter.chapter.replaceAll('_', ' ') : `Chapter ${chapter.chapter}`}</strong>
        </div>
        {!chapter.isOffline && (
          <div className="reader-actions">
            <button className="reader-button" disabled={!hasOlder} onClick={onOlder} type="button">
              <ChevronLeft aria-hidden="true" /> Lama
            </button>
            <button className="reader-button" disabled={!hasNewer} onClick={onNewer} type="button">
              Baru <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <div className="reader-pages">
        {loading && (
          <div className="reader-state">
            <LoaderCircle className="spin" aria-hidden="true" />
            <p>Menyiapkan halaman…</p>
          </div>
        )}
        {!loading && error && (
          <div className="reader-state reader-error">
            <WifiOff aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && pages.map((url, index) => (
          <ImageWithFallback
            key={`${url}-${index}`}
            src={url}
            alt={`Halaman ${index + 1}`}
            className="reader-page"
            eager={index < 2}
          />
        ))}
        {!loading && !error && pages.length > 0 && (
          <div className="reader-end">
            <Sparkles aria-hidden="true" />
            <strong>Selesai membaca</strong>
            <span>{pages.length} halaman</span>
            <div>
              {!chapter.isOffline && (
                <button className="button button-secondary" disabled={!hasOlder} onClick={onOlder} type="button">
                  Chapter sebelumnya
                </button>
              )}
              <button className="button button-primary" onClick={onClose} type="button">Kembali</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('discover')
  const [searchQuery, setSearchQuery] = useState('')
  const [mangaList, setMangaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [discoverError, setDiscoverError] = useState('')
  const [recommendationSeed, setRecommendationSeed] = useState(() => Date.now())

  const [filterDemo, setFilterDemo] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')
  const [selectedRatings, setSelectedRatings] = useState([])
  const [tagsList, setTagsList] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [selectedManga, setSelectedManga] = useState(null)
  const [chapters, setChapters] = useState([])
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [chapterError, setChapterError] = useState('')
  const [chapterFetchInfo, setChapterFetchInfo] = useState(null)
  const [langFilter, setLangFilter] = useState('en')
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({})

  const [libraryList, setLibraryList] = useState([])
  const [downloadsList, setDownloadsList] = useState([])
  const [sectionLoading, setSectionLoading] = useState(false)
  const [expandedDownload, setExpandedDownload] = useState(null)

  const [settings, setSettings] = useState({ downloadPath: 'Documents/MangaX', quality: 'dataSaver' })
  const [readingChapter, setReadingChapter] = useState(null)
  const [readerPages, setReaderPages] = useState([])
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState('')
  const [readerControls, setReaderControls] = useState(true)
  const detailRequestId = useRef(0)
  const readerRequestId = useRef(0)
  const recommendationHistory = useRef(null)

  const isPersonalizedDashboard = !searchQuery.trim()
    && !filterDemo
    && !filterOrigin
    && selectedRatings.length === 0
    && selectedTags.length === 0

  const languageOptions = useMemo(() => {
    const counts = chapters.reduce((result, chapter) => {
      result[chapter.language] = (result[chapter.language] || 0) + 1
      return result
    }, {})
    return Object.entries(counts).sort(([left], [right]) => {
      const preferred = ['id', 'en']
      const leftIndex = preferred.indexOf(left)
      const rightIndex = preferred.indexOf(right)
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
      }
      return left.localeCompare(right)
    })
  }, [chapters])

  const filteredChapters = useMemo(
    () => chapters.filter(chapter => chapter.language === langFilter),
    [chapters, langFilter],
  )

  const closeDetail = useCallback(() => {
    detailRequestId.current += 1
    setSelectedManga(null)
    setChapters([])
    setChapterError('')
    setDownloadProgress({})
  }, [])

  const closeReader = useCallback(() => {
    readerRequestId.current += 1
    setReadingChapter(null)
    setReaderPages([])
    setReaderError('')
  }, [])

  const switchTab = useCallback((tab) => {
    setActiveTab(tab)
    setSectionLoading(tab !== 'discover')
    closeDetail()
  }, [closeDetail])

  useEffect(() => {
    let active = true
    Promise.all([api.getSettings(), api.fetchTags()]).then(([savedSettings, tags]) => {
      if (!active) return
      setSettings(savedSettings)
      setTagsList(tags)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (selectedManga || activeTab !== 'discover') return undefined
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        let items
        if (isPersonalizedDashboard) {
          const recentIds = recommendationHistory.current
            || await api.getRecommendationHistory()
          recommendationHistory.current = recentIds
          items = await api.fetchDashboardRecommendations({
            library: await api.getLibrary(),
            recentIds,
            seed: recommendationSeed,
            limit: 30,
          })
        } else {
          items = await api.fetchMangaList({
              query: searchQuery.trim(),
              tags: selectedTags,
              contentRatings: selectedRatings,
              demographic: filterDemo ? [filterDemo] : undefined,
              originalLanguage: filterOrigin ? [filterOrigin] : undefined,
              limit: 30,
            })
        }
        if (!cancelled) {
          setMangaList(items)
          setDiscoverError('')
          setLoading(false)
          if (isPersonalizedDashboard) {
            const shownIds = items.map(manga => manga.id)
            recommendationHistory.current = api.updateRecommendationHistory(
              recommendationHistory.current || [],
              shownIds,
            )
            void api.recordShownRecommendations(shownIds)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDiscoverError(error.message || 'Tidak dapat terhubung ke MangaDex.')
          setLoading(false)
        }
      }
    }, searchQuery.trim() ? 420 : 40)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    activeTab,
    filterDemo,
    filterOrigin,
    isPersonalizedDashboard,
    recommendationSeed,
    searchQuery,
    selectedManga,
    selectedRatings,
    selectedTags,
  ])

  useEffect(() => {
    let active = true
    if (activeTab === 'library') {
      api.getLibrary().then(items => {
        if (active) {
          setLibraryList(items || [])
          setSectionLoading(false)
        }
      })
    }
    if (activeTab === 'downloads') {
      api.getDownloads().then(items => {
        if (active) {
          setDownloadsList(items || [])
          setSectionLoading(false)
        }
      })
    }
    if (activeTab === 'settings') setSectionLoading(false)
    return () => {
      active = false
    }
  }, [activeTab])

  useEffect(() => {
    let listener
    CapacitorApp.addListener('backButton', () => {
      if (readingChapter) closeReader()
      else if (selectedManga) closeDetail()
      else if (activeTab !== 'discover') switchTab('discover')
      else CapacitorApp.exitApp()
    }).then(handle => {
      listener = handle
    })
    return () => listener?.remove()
  }, [activeTab, closeDetail, closeReader, readingChapter, selectedManga, switchTab])

  useEffect(() => {
    if (!readingChapter || !readerControls) return undefined
    const timer = window.setTimeout(() => setReaderControls(false), 3200)
    return () => window.clearTimeout(timer)
  }, [readerControls, readingChapter])

  function markDiscoverLoading() {
    setLoading(true)
    setDiscoverError('')
  }

  function updateSearch(value) {
    markDiscoverLoading()
    setSearchQuery(value)
  }

  function updateFilter(setter, value) {
    markDiscoverLoading()
    setter(value)
  }

  function clearFilters() {
    markDiscoverLoading()
    setSearchQuery('')
    setFilterDemo('')
    setFilterOrigin('')
    setSelectedRatings([])
    setSelectedTags([])
    setRecommendationSeed(seed => seed + 1)
  }

  async function selectManga(manga) {
    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    setSelectedManga(manga)
    setLoadingChapters(true)
    setChapterFetchInfo(null)
    setChapterError('')
    setChapters([])
    setIsBookmarked(false)
    void api.isInLibrary(manga.id).then(bookmarked => {
      if (detailRequestId.current === requestId) setIsBookmarked(bookmarked)
    }).catch(error => {
      void error
    })
    try {
      const items = await api.fetchMangaChapters(manga.id, info => {
        if (detailRequestId.current === requestId) setChapterFetchInfo(info)
      })
      if (detailRequestId.current !== requestId) return
      setChapters(items)
      const languages = [...new Set(items.map(chapter => chapter.language))]
      setLangFilter(languages.includes('id') ? 'id' : (languages.includes('en') ? 'en' : languages[0] || 'en'))
    } catch (error) {
      if (detailRequestId.current === requestId) {
        setChapterError(error.message || 'Chapter gagal dimuat.')
      }
    } finally {
      if (detailRequestId.current === requestId) {
        setLoadingChapters(false)
        setChapterFetchInfo(null)
      }
    }
  }

  async function toggleBookmark() {
    if (!selectedManga) return
    if (isBookmarked) {
      await api.removeFromLibrary(selectedManga.id)
      setIsBookmarked(false)
      return
    }
    await api.addToLibrary({ ...selectedManga })
    setIsBookmarked(true)
  }

  async function openReader(chapter) {
    const requestId = readerRequestId.current + 1
    readerRequestId.current = requestId
    setReadingChapter(chapter)
    setReaderLoading(true)
    setReaderPages([])
    setReaderError('')
    setReaderControls(true)
    try {
      const pages = await api.fetchChapterPages({ chapterId: chapter.id, quality: settings.quality })
      if (pages.length === 0) throw new Error('Chapter ini belum memiliki halaman yang dapat dibaca.')
      if (readerRequestId.current !== requestId) return
      setReaderPages(pages)
    } catch (error) {
      if (readerRequestId.current === requestId) {
        setReaderError(error.message || 'Halaman gagal dimuat. Periksa koneksi Anda.')
      }
    } finally {
      if (readerRequestId.current === requestId) setReaderLoading(false)
    }
  }

  async function openOfflineReader(mangaName, chapterName) {
    const requestId = readerRequestId.current + 1
    readerRequestId.current = requestId
    const offlineChapter = { id: 'offline', chapter: chapterName, isOffline: true }
    setReadingChapter(offlineChapter)
    setReaderLoading(true)
    setReaderPages([])
    setReaderError('')
    setReaderControls(true)
    try {
      const pages = await api.getOfflinePages(mangaName, chapterName)
      if (pages.length === 0) throw new Error('File halaman offline tidak ditemukan.')
      if (readerRequestId.current !== requestId) return
      setReaderPages(pages)
    } catch (error) {
      if (readerRequestId.current === requestId) {
        setReaderError(error.message || 'Chapter offline tidak dapat dibuka.')
      }
    } finally {
      if (readerRequestId.current === requestId) setReaderLoading(false)
    }
  }

  function openAdjacentChapter(direction) {
    if (!readingChapter || readingChapter.isOffline) return
    const index = filteredChapters.findIndex(chapter => chapter.id === readingChapter.id)
    const nextIndex = direction === 'newer' ? index - 1 : index + 1
    if (nextIndex >= 0 && nextIndex < filteredChapters.length) openReader(filteredChapters[nextIndex])
  }

  async function downloadChapter(chapter) {
    setDownloadProgress(progress => ({
      ...progress,
      [chapter.id]: { status: 'fetching', progress: 0, total: 1 },
    }))
    try {
      const pages = await api.fetchChapterPages({ chapterId: chapter.id, quality: settings.quality })
      if (pages.length === 0) throw new Error('Tidak ada halaman yang bisa diunduh.')
      const chapterTitle = `Chapter ${chapter.chapter}${chapter.title ? ` - ${chapter.title}` : ''}`
      const result = await api.downloadChapter(
        { mangaTitle: selectedManga.title, chapterTitle, pages },
        info => setDownloadProgress(progress => ({
          ...progress,
          [chapter.id]: { status: 'downloading', progress: info.progress, total: info.total },
        })),
      )
      if (!result.success) throw new Error(result.error || 'Unduhan gagal.')
      setDownloadProgress(progress => ({
        ...progress,
        [chapter.id]: { status: 'done', progress: pages.length, total: pages.length },
      }))
    } catch (error) {
      setDownloadProgress(progress => ({
        ...progress,
        [chapter.id]: { status: 'error', error: error.message },
      }))
    }
  }

  async function downloadAllChapters() {
    for (const chapter of filteredChapters) {
      if (downloadProgress[chapter.id]?.status !== 'done') await downloadChapter(chapter)
    }
  }

  async function saveSetting(key, value) {
    const nextSettings = { ...settings, [key]: value }
    setSettings(nextSettings)
    await api.saveSettings(nextSettings)
  }

  function renderDiscover() {
    const featured = isPersonalizedDashboard ? mangaList[0] : null
    const cards = featured ? mangaList.slice(1) : mangaList

    return (
      <div className="page discover-page">
        <div className="mobile-brand">
          <span>MX</span>
          <strong>MangaX</strong>
        </div>

        {featured && !loading && (
          <section className="featured-card">
            <div className="featured-art" aria-hidden="true">
              <ImageWithFallback src={featured.cover} alt="" className="featured-backdrop" eager />
            </div>
            <div className="featured-copy">
              <span className="eyebrow"><Sparkles aria-hidden="true" /> Pilihan untukmu</span>
              <h1>{featured.title}</h1>
              <p>{featured.description || `Karya ${featured.author} yang layak masuk antrean bacamu.`}</p>
              <div className="featured-tags">
                {(featured.tags || []).slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}
              </div>
              <div className="featured-actions">
                <button className="button button-primary" onClick={() => selectManga(featured)} type="button">
                  <BookOpen aria-hidden="true" /> Lihat chapter
                </button>
                <button className="button button-quiet" onClick={() => {
                  markDiscoverLoading()
                  setRecommendationSeed(Date.now())
                }} type="button">
                  <RefreshCw aria-hidden="true" /> Ganti pilihan
                </button>
              </div>
            </div>
            <ImageWithFallback src={featured.cover} alt={featured.title} className="featured-cover" eager />
          </section>
        )}

        <section className="filter-section">
          <button className={`filter-toggle ${filtersOpen ? 'is-open' : ''}`} onClick={() => setFiltersOpen(open => !open)} type="button">
            <Filter aria-hidden="true" /> Filter katalog
            {(filterDemo || filterOrigin || selectedRatings.length || selectedTags.length) ? <span className="filter-count">Aktif</span> : null}
            <ChevronDown aria-hidden="true" />
          </button>
          <div className={`filter-panel ${filtersOpen ? 'is-open' : ''}`}>
            <label>
              <span>Asal</span>
              <select value={filterOrigin} onChange={event => updateFilter(setFilterOrigin, event.target.value)}>
                <option value="">Semua negara</option>
                <option value="ja">Jepang · Manga</option>
                <option value="ko">Korea · Manhwa</option>
                <option value="zh">Tiongkok · Manhua</option>
              </select>
            </label>
            <label>
              <span>Demografi</span>
              <select value={filterDemo} onChange={event => updateFilter(setFilterDemo, event.target.value)}>
                <option value="">Semua pembaca</option>
                <option value="shounen">Shounen</option>
                <option value="shoujo">Shoujo</option>
                <option value="seinen">Seinen</option>
                <option value="josei">Josei</option>
              </select>
            </label>
            <label>
              <span>Rating konten</span>
              <select value="" onChange={event => {
                const value = event.target.value
                if (value && !selectedRatings.includes(value)) updateFilter(setSelectedRatings, [...selectedRatings, value])
              }}>
                <option value="">Tambah rating</option>
                <option value="safe">Safe</option>
                <option value="suggestive">Suggestive</option>
                <option value="erotica">Erotica</option>
              </select>
            </label>
            <label>
              <span>Genre</span>
              <select value="" onChange={event => {
                const value = event.target.value
                if (value && !selectedTags.includes(value)) updateFilter(setSelectedTags, [...selectedTags, value])
              }}>
                <option value="">Tambah genre</option>
                {tagsList.map(tag => <option value={tag.id} key={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <button className="button button-quiet clear-filter" onClick={clearFilters} type="button">
              <X aria-hidden="true" /> Bersihkan
            </button>
          </div>
          {(selectedRatings.length > 0 || selectedTags.length > 0) && (
            <div className="active-filters">
              {selectedRatings.map(rating => (
                <button key={rating} type="button" onClick={() => updateFilter(setSelectedRatings, selectedRatings.filter(item => item !== rating))}>
                  {rating} <X aria-hidden="true" />
                </button>
              ))}
              {selectedTags.map(tagId => (
                <button key={tagId} type="button" onClick={() => updateFilter(setSelectedTags, selectedTags.filter(item => item !== tagId))}>
                  {tagsList.find(tag => tag.id === tagId)?.name || 'Genre'} <X aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="catalog-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{isPersonalizedDashboard ? 'Kurasi dinamis' : 'Hasil eksplorasi'}</span>
              <h2>{isPersonalizedDashboard ? 'Bacaan berikutnya' : `Temukan “${searchQuery || 'manga'}”`}</h2>
            </div>
            {!isPersonalizedDashboard && <span>{mangaList.length} judul</span>}
          </div>

          {loading && <LoadingGrid />}
          {!loading && discoverError && (
            <EmptyState
              icon={WifiOff}
              title="Katalog belum tersambung"
              message={`${discoverError} Coba lagi setelah koneksi stabil.`}
              actionLabel="Coba lagi"
              onAction={() => {
                markDiscoverLoading()
                setRecommendationSeed(Date.now())
              }}
            />
          )}
          {!loading && !discoverError && cards.length === 0 && (
            <EmptyState
              icon={Compass}
              title="Belum ada hasil"
              message="Coba kata kunci yang lebih singkat atau longgarkan filter katalog."
              actionLabel="Reset filter"
              onAction={clearFilters}
            />
          )}
          {!loading && !discoverError && cards.length > 0 && (
            <div className="manga-grid">
              {cards.map((manga, index) => (
                <MangaCard manga={manga} index={index} onSelect={selectManga} key={manga.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderDetail() {
    const firstChapter = filteredChapters[filteredChapters.length - 1]
    return (
      <div className="page detail-page">
        <button className="back-link" onClick={closeDetail} type="button">
          <ArrowLeft aria-hidden="true" /> Kembali ke katalog
        </button>

        <section className="detail-hero">
          <div className="detail-cover-stack">
            <ImageWithFallback src={selectedManga.cover} alt={selectedManga.title} className="detail-cover" eager />
            <span className="detail-number">MX · {selectedManga.status}</span>
          </div>
          <div className="detail-copy">
            <span className="eyebrow">{selectedManga.author}</span>
            <h1>{selectedManga.title}</h1>
            <div className="detail-tags">
              {(selectedManga.tags || []).slice(0, 7).map(tag => <span key={tag}>{tag}</span>)}
            </div>
            <p className="detail-description">{selectedManga.description || 'Belum ada sinopsis untuk judul ini.'}</p>
            <div className="detail-actions">
              <button className="button button-primary" onClick={() => firstChapter && openReader(firstChapter)} disabled={!firstChapter} type="button">
                <Play aria-hidden="true" /> Mulai membaca
              </button>
              <button className={`button button-secondary ${isBookmarked ? 'is-active' : ''}`} onClick={toggleBookmark} type="button">
                <Heart fill={isBookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
                {isBookmarked ? 'Tersimpan' : 'Simpan'}
              </button>
            </div>
          </div>
        </section>

        <section className="chapter-section">
          <div className="section-heading chapter-heading">
            <div>
              <span className="eyebrow">Daftar rilis</span>
              <h2>Chapter</h2>
              <p>
                {loadingChapters && chapterFetchInfo
                  ? `${chapterFetchInfo.fetched} dari ${chapterFetchInfo.total} dimuat`
                  : `${chapters.length} chapter ditemukan`}
              </p>
            </div>
            {filteredChapters.length > 0 && (
              <button className="button button-secondary" onClick={downloadAllChapters} type="button">
                <FileDown aria-hidden="true" /> Unduh semua
              </button>
            )}
          </div>

          {languageOptions.length > 0 && (
            <div className="language-tabs" role="tablist" aria-label="Bahasa chapter">
              {languageOptions.map(([code, count]) => (
                <button
                  className={langFilter === code ? 'is-active' : ''}
                  key={code}
                  onClick={() => setLangFilter(code)}
                  role="tab"
                  type="button"
                >
                  <Languages aria-hidden="true" /> {languageName(code)} <span>{count}</span>
                </button>
              ))}
            </div>
          )}

          {loadingChapters && (
            <div className="chapter-loading"><LoaderCircle className="spin" aria-hidden="true" /> Mengambil semua chapter…</div>
          )}
          {!loadingChapters && chapterError && (
            <EmptyState icon={WifiOff} title="Chapter gagal dimuat" message={chapterError} actionLabel="Coba lagi" onAction={() => selectManga(selectedManga)} />
          )}
          {!loadingChapters && !chapterError && filteredChapters.length === 0 && (
            <EmptyState icon={BookMarked} title="Belum ada chapter" message="Tidak ada chapter pada bahasa yang dipilih. Coba tab bahasa lain." />
          )}
          {!loadingChapters && !chapterError && filteredChapters.length > 0 && (
            <div className="chapter-list">
              {filteredChapters.map(chapter => {
                const progress = downloadProgress[chapter.id]
                const percent = progress?.total ? Math.round((progress.progress / progress.total) * 100) : 0
                return (
                  <article className="chapter-row" key={chapter.id}>
                    <button className="chapter-play" onClick={() => openReader(chapter)} type="button" aria-label={`Baca chapter ${chapter.chapter}`}>
                      <Play aria-hidden="true" />
                    </button>
                    <div className="chapter-copy">
                      <strong>Chapter {chapter.chapter}</strong>
                      {chapter.title && <span>{chapter.title}</span>}
                      <small><Users aria-hidden="true" /> {chapter.group} · {chapter.pages} halaman · {chapter.publishAt}</small>
                      {progress?.status === 'downloading' && (
                        <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
                      )}
                      {progress?.status === 'error' && <small className="error-copy"><AlertTriangle aria-hidden="true" /> {progress.error}</small>}
                    </div>
                    <button
                      className={`download-button is-${progress?.status || 'idle'}`}
                      disabled={progress?.status === 'fetching' || progress?.status === 'downloading' || progress?.status === 'done'}
                      onClick={() => downloadChapter(chapter)}
                      type="button"
                    >
                      {progress?.status === 'fetching' && <><LoaderCircle className="spin" aria-hidden="true" /> Menyiapkan</>}
                      {progress?.status === 'downloading' && <><LoaderCircle className="spin" aria-hidden="true" /> {percent}%</>}
                      {progress?.status === 'done' && <><Check aria-hidden="true" /> Tersimpan</>}
                      {progress?.status === 'error' && <><RefreshCw aria-hidden="true" /> Ulangi</>}
                      {!progress && <><Download aria-hidden="true" /> Unduh</>}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderLibrary() {
    return (
      <div className="page simple-page">
        <div className="page-title">
          <span className="eyebrow">Rak personal</span>
          <h1>Koleksi</h1>
          <p>Judul yang kamu simpan untuk dibaca nanti.</p>
        </div>
        {sectionLoading && <LoadingGrid />}
        {!sectionLoading && libraryList.length === 0 && (
          <EmptyState icon={Heart} title="Rakmu masih kosong" message="Simpan manga dari Beranda agar mudah ditemukan kembali." actionLabel="Jelajahi manga" onAction={() => switchTab('discover')} />
        )}
        {!sectionLoading && libraryList.length > 0 && (
          <div className="manga-grid">
            {libraryList.map((manga, index) => (
              <MangaCard key={manga.id} manga={manga} index={index} onSelect={(item) => {
                setActiveTab('discover')
                selectManga(item)
              }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderDownloads() {
    return (
      <div className="page simple-page narrow-page">
        <div className="page-title">
          <span className="eyebrow">Baca tanpa jaringan</span>
          <h1>Unduhan</h1>
          <p>Chapter PDF dan halaman reader yang tersimpan di perangkat.</p>
        </div>
        {sectionLoading && <div className="chapter-loading"><LoaderCircle className="spin" aria-hidden="true" /> Memindai folder…</div>}
        {!sectionLoading && downloadsList.length === 0 && (
          <EmptyState icon={Download} title="Belum ada unduhan" message="Unduh chapter dari halaman detail untuk membaca tanpa koneksi." actionLabel="Cari bacaan" onAction={() => switchTab('discover')} />
        )}
        {!sectionLoading && downloadsList.length > 0 && (
          <div className="download-groups">
            {downloadsList.map((manga, index) => (
              <article className="download-group" key={manga.path}>
                <button className="download-group-header" onClick={() => setExpandedDownload(expandedDownload === index ? null : index)} type="button">
                  <div className="download-group-icon"><BookMarked aria-hidden="true" /></div>
                  <div>
                    <strong>{manga.name.replaceAll('_', ' ')}</strong>
                    <span>{manga.chapters.length} chapter · {formatSize(manga.totalSize)}</span>
                  </div>
                  <ChevronDown className={expandedDownload === index ? 'rotate' : ''} aria-hidden="true" />
                </button>
                {expandedDownload === index && (
                  <div className="download-chapters">
                    {manga.chapters.map(chapter => (
                      <div className="download-chapter" key={chapter.path}>
                        <div><FileDown aria-hidden="true" /><span><strong>{chapter.name.replaceAll('_', ' ')}</strong><small>{formatSize(chapter.size)}</small></span></div>
                        <div>
                          <button className="icon-button" onClick={() => openOfflineReader(manga.name, chapter.name)} type="button" aria-label="Baca offline"><BookOpen aria-hidden="true" /></button>
                          <button className="icon-button" onClick={() => api.openFolder(chapter.path)} type="button" aria-label="Buka PDF"><FolderOpen aria-hidden="true" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderSettings() {
    return (
      <div className="page simple-page narrow-page">
        <div className="page-title">
          <span className="eyebrow">Pengalaman membaca</span>
          <h1>Setelan</h1>
          <p>Atur kualitas gambar dan pahami lokasi file aplikasi.</p>
        </div>
        <section className="settings-card storage-card">
          <div className="settings-icon"><HardDrive aria-hidden="true" /></div>
          <div>
            <span className="eyebrow">Penyimpanan</span>
            <h2>Documents/MangaX</h2>
            <p>PDF dan salinan reader disimpan di ruang dokumen milik MangaX tanpa meminta akses ke seluruh file perangkat.</p>
          </div>
          <ShieldCheck aria-label="Penyimpanan lokal" />
        </section>
        <section className="settings-card quality-card">
          <div className="settings-card-heading">
            <div className="settings-icon"><Image aria-hidden="true" /></div>
            <div><h2>Kualitas gambar</h2><p>Berlaku untuk reader dan unduhan berikutnya.</p></div>
          </div>
          <div className="quality-options">
            <button className={settings.quality === 'dataSaver' ? 'is-selected' : ''} onClick={() => saveSetting('quality', 'dataSaver')} type="button">
              <span><Sparkles aria-hidden="true" /><strong>Hemat data</strong></span>
              <p>Lebih cepat, ringan, dan ideal untuk layar ponsel.</p>
              {settings.quality === 'dataSaver' && <Check aria-hidden="true" />}
            </button>
            <button className={settings.quality === 'data' ? 'is-selected' : ''} onClick={() => saveSetting('quality', 'data')} type="button">
              <span><Image aria-hidden="true" /><strong>Resolusi asli</strong></span>
              <p>Detail maksimal dengan penggunaan data dan ruang lebih besar.</p>
              {settings.quality === 'data' && <Check aria-hidden="true" />}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const readerIndex = readingChapter && !readingChapter.isOffline
    ? filteredChapters.findIndex(chapter => chapter.id === readingChapter.id)
    : -1

  return (
    <div className="app-shell">
      {readingChapter && (
        <Reader
          chapter={readingChapter}
          mangaTitle={readingChapter.isOffline ? 'Bacaan offline' : selectedManga?.title}
          pages={readerPages}
          loading={readerLoading}
          error={readerError}
          controlsVisible={readerControls}
          hasOlder={readerIndex >= 0 && readerIndex < filteredChapters.length - 1}
          hasNewer={readerIndex > 0}
          onClose={closeReader}
          onOlder={() => openAdjacentChapter('older')}
          onNewer={() => openAdjacentChapter('newer')}
          onToggleControls={() => setReaderControls(visible => !visible)}
        />
      )}

      <aside className="navigation">
        <div className="brand-mark"><span>MX</span><div><strong>MangaX</strong><small>Reader & archive</small></div></div>
        <nav aria-label="Navigasi utama">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button className={activeTab === item.id ? 'is-active' : ''} onClick={() => switchTab(item.id)} key={item.id} type="button">
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="navigation-note"><Sparkles aria-hidden="true" /><span>Rekomendasi berubah mengikuti selera dan riwayatmu.</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <span>{activeTab === 'discover' ? 'Explore' : NAV_ITEMS.find(item => item.id === activeTab)?.label}</span>
            <strong>{selectedManga?.title || 'Temukan cerita baru'}</strong>
          </div>
          <label className={`search-field ${activeTab !== 'discover' || selectedManga ? 'is-disabled' : ''}`}>
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari judul atau kata kunci…"
              value={searchQuery}
              onChange={event => updateSearch(event.target.value)}
              disabled={activeTab !== 'discover' || Boolean(selectedManga)}
            />
            {searchQuery && !selectedManga && (
              <button onClick={() => updateSearch('')} type="button" aria-label="Hapus pencarian"><X aria-hidden="true" /></button>
            )}
          </label>
        </header>

        <div className="content-scroll">
          {selectedManga
            ? renderDetail()
            : activeTab === 'library'
              ? renderLibrary()
              : activeTab === 'downloads'
                ? renderDownloads()
                : activeTab === 'settings'
                  ? renderSettings()
                  : renderDiscover()}
        </div>
      </main>
    </div>
  )
}
