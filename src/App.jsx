import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Download, BookOpen, Settings, Library, Compass, Loader2, ArrowLeft, CheckCircle, AlertCircle, Heart, FolderOpen, ChevronLeft, ChevronRight, X, PlayCircle, Users, LayoutList, Layers, AlignLeft, RefreshCw, ShieldOff } from 'lucide-react'
import { App as CapacitorApp } from '@capacitor/app'
import * as api from './services/mobileAPI'
import './index.css'

function ProxiedImage({ src, alt, className, style, onClick }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let c = false; setLoading(true); setImageSrc(null);
    if (!src) { setLoading(false); return; }
    
    api.proxyImage(src).then(d => { if (!c) { setImageSrc(d); setLoading(false); } }).catch(() => { if (!c) setLoading(false); });
    
    return () => { c = true; };
  }, [src]);
  
  if (loading) return <div className={className} style={{ ...style, display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-surface-hover)' }} onClick={onClick}><Loader2 size={24} color="var(--accent-primary)" style={{animation:'spin 1s linear infinite'}} /></div>;
  if (!imageSrc) return <div className={className} style={{ ...style, display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-surface-hover)',color:'var(--text-muted)',fontSize:'2rem',fontWeight:'700' }} onClick={onClick}>{(alt||'?')[0].toUpperCase()}</div>;
  return <img src={imageSrc} alt={alt} className={className} style={style} loading="lazy" onClick={onClick} />;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

export default function App() {
  const [activeTab, setActiveTab] = useState('discover')
  const [searchQuery, setSearchQuery] = useState('')
  const [mangaList, setMangaList] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Filter States
  const [filterDemo, setFilterDemo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [tagsList, setTagsList] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  
  const [selectedManga, setSelectedManga] = useState(null)
  const [chapters, setChapters] = useState([])
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [langFilter, setLangFilter] = useState('en')
  const [downloadProgress, setDownloadProgress] = useState({})
  const [chapterFetchInfo, setChapterFetchInfo] = useState(null)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [libraryList, setLibraryList] = useState([])
  const [downloadsList, setDownloadsList] = useState([])
  const [expandedDl, setExpandedDl] = useState(null)

  // Settings & Reader
  const [settings, setSettings] = useState({ downloadPath: '', quality: 'dataSaver', goonerMode: false })
  // Refresh seed — random offset triggers fresh recommendations
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [readingChapter, setReadingChapter] = useState(null)
  const [readerPages, setReaderPages] = useState([])
  const [readerLoading, setReaderLoading] = useState(false)
  const [showHeader, setShowHeader] = useState(true)

  // Auto-hide reader header
  useEffect(() => {
    let t;
    if (readingChapter && showHeader) {
      t = setTimeout(() => setShowHeader(false), 3000);
    }
    return () => clearTimeout(t);
  }, [readingChapter, showHeader]);

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.fetchTags().then(setTagsList);
  }, []);

  // Hardware Back Button Navigation
  useEffect(() => {
    const handleBackButton = () => {
      if (readingChapter) {
        closeReader();
      } else if (selectedManga) {
        handleBack();
      } else if (activeTab !== 'discover') {
        switchTab('discover');
      } else {
        CapacitorApp.exitApp();
      }
    };
    const listener = CapacitorApp.addListener('backButton', handleBackButton);
    return () => { listener.then(l => l.remove()); };
  }, [readingChapter, selectedManga, activeTab]);

  const loadLibrary = useCallback(async () => { setLibraryList(await api.getLibrary() || []); }, []);
  const loadDownloads = useCallback(async () => { setDownloadsList(await api.getDownloads() || []); }, []);

  useEffect(() => { if (activeTab === 'library') loadLibrary(); if (activeTab === 'downloads') loadDownloads(); }, [activeTab, loadLibrary, loadDownloads]);

  // Fetch manga list with filters
  useEffect(() => {
    if (selectedManga) return;
    const get = async () => {
      setLoading(true);
      try {
        const opts = {
          query: searchQuery,
          tags: selectedTags,
          goonerMode: settings.goonerMode,
          // Use refreshSeed as random offset (steps of 30) for variety
          offset: !searchQuery && selectedTags.length === 0 && !filterDemo && !filterStatus
            ? (refreshSeed % 17) * 30  // 0..480
            : 0,
        };
        if (filterDemo) opts.demographic = [filterDemo];
        if (filterStatus) opts.status = [filterStatus];
        setMangaList(await api.fetchMangaList(opts) || []);
      } catch(e) { setMangaList([]); }
      setLoading(false);
    };
    const t = setTimeout(get, 300); return () => clearTimeout(t);
  }, [searchQuery, filterDemo, filterStatus, selectedTags, selectedManga, settings.goonerMode, refreshSeed]);

  const handleSelectManga = useCallback(async (manga) => {
    setSelectedManga(manga); setLoadingChapters(true); setChapterFetchInfo(null); setLangFilter('en');
    setIsBookmarked(await api.isInLibrary(manga.id));
    try {
      const d = await api.fetchMangaChapters(manga.id, (info) => setChapterFetchInfo(info)); 
      setChapters(d||[]);
      const en = (d||[]).filter(c=>c.language==='en').length, id = (d||[]).filter(c=>c.language==='id').length;
      if (id > 0 && en === 0) setLangFilter('id');
    } catch(e) { setChapters([]); }
    setLoadingChapters(false); setChapterFetchInfo(null);
  }, []);

  const handleBack = useCallback(() => { setSelectedManga(null); setChapters([]); setDownloadProgress({}); }, []);

  const toggleBookmark = useCallback(async () => {
    if (!selectedManga) return;
    if (isBookmarked) { await api.removeFromLibrary(selectedManga.id); setIsBookmarked(false); }
    else { await api.addToLibrary(selectedManga); setIsBookmarked(true); }
  }, [selectedManga, isBookmarked]);

  const handleDownload = useCallback(async (e, chapter) => {
    if(e) e.stopPropagation(); 
    const label = `Chapter ${chapter.chapter}${chapter.title?` - ${chapter.title}`:''}`;
    setDownloadProgress(p => ({...p,[label]:{progress:0,total:1,status:'fetching'}}));
    try {
      const pages = await api.fetchChapterPages({ chapterId: chapter.id, quality: settings.quality });
      if (!pages?.length) { setDownloadProgress(p => ({...p,[label]:{error:'No pages found'}})); return; }
      
      const r = await api.downloadChapter(
        { mangaTitle:selectedManga.title, chapterTitle:label, pages },
        (info) => setDownloadProgress(p => ({...p,[label]:{progress:info.progress,total:info.total}}))
      );
      if (!r.success) setDownloadProgress(p => ({...p,[label]:{error:r.error}}));
    } catch(err) { setDownloadProgress(p => ({...p,[label]:{error:'Network error'}})); }
  }, [selectedManga, settings]);

  const enChapters = chapters.filter(c=>c.language==='en'), idChapters = chapters.filter(c=>c.language==='id');
  const filteredChapters = langFilter==='en'?enChapters:idChapters;

  const handleDownloadAll = useCallback(async () => {
    if (!selectedManga || filteredChapters.length === 0) return;
    const toDl = filteredChapters.filter(c => {
      const label = `Chapter ${c.chapter}${c.title ? ` - ${c.title}` : ''}`;
      const p = downloadProgress[label];
      const done = p && p.progress === p.total && p.total > 1;
      const dl = p && p.progress < p.total && !p.error && p.status !== 'fetching';
      return !done && !dl && p?.status !== 'fetching';
    });
    for (const c of toDl) await handleDownload(null, c);
  }, [selectedManga, filteredChapters, downloadProgress, handleDownload]);

  const switchTab = (tab) => { setActiveTab(tab); handleBack(); };

  // Reader Logic
  const handleRead = async (chapter) => {
    setReadingChapter(chapter);
    setReaderLoading(true);
    setReaderPages([]);
    try {
      const p = await api.fetchChapterPages({ chapterId: chapter.id, quality: settings.quality });
      setReaderPages(p || []);
    } catch(e) { console.error('Reader fetch fail:', e); }
    setReaderLoading(false);
  };

  const handleReadOffline = async (mangaName, chapterName) => {
    setReadingChapter({ id: 'offline', chapter: chapterName, isOffline: true });
    setReaderLoading(true);
    setReaderPages([]);
    try {
      const p = await api.getOfflinePages(mangaName, chapterName);
      setReaderPages(p || []);
    } catch(e) { console.error('Offline fetch fail:', e); }
    setReaderLoading(false);
  };

  const closeReader = () => { setReadingChapter(null); setReaderPages([]); };

  const handleNextChapter = () => {
    const idx = filteredChapters.findIndex(c => c.id === readingChapter.id);
    if (idx > 0) handleRead(filteredChapters[idx - 1]);
  };

  const handlePrevChapter = () => {
    const idx = filteredChapters.findIndex(c => c.id === readingChapter.id);
    if (idx < filteredChapters.length - 1 && idx !== -1) handleRead(filteredChapters[idx + 1]);
  };

  // Settings Logic
  const handleSaveSettings = async (k, v) => {
    const newSet = { ...settings, [k]: v };
    setSettings(newSet);
    await api.saveSettings(newSet);
  };

  const handleRefreshDiscover = () => {
    setRefreshSeed(prev => prev + 1);
  };

  // ─── RENDERS ───
  const renderReader = () => {
    let hasNext = false, hasPrev = false;
    let mangaDisplay = readingChapter.isOffline ? 'Offline Reading' : selectedManga?.title;

    if (!readingChapter.isOffline) {
      const idx = filteredChapters.findIndex(c => c.id === readingChapter.id);
      hasNext = idx > 0;
      hasPrev = idx < filteredChapters.length - 1 && idx !== -1;
    }

    return (
      <div className="reader-overlay" onClick={() => setShowHeader(prev => !prev)}>
        <div className={`reader-header ${showHeader ? '' : 'hidden'}`} onClick={e => e.stopPropagation()}>
          <button className="reader-nav-btn" onClick={closeReader} style={{padding:'8px 16px', background:'transparent', border:'none'}}>
            <ArrowLeft size={20}/> Back
          </button>
          <div style={{fontWeight:'700', fontSize:'1.1rem', letterSpacing:'0.02em'}}>{mangaDisplay} <span style={{color:'var(--accent-primary)', fontWeight:'800'}}>&bull; {readingChapter.isOffline ? readingChapter.chapter.replace(/_/g,' ') : `Ch. ${readingChapter.chapter}`}</span></div>
          <div style={{display:'flex', gap:'12px'}}>
            <button className="reader-nav-btn" onClick={handlePrevChapter} disabled={!hasPrev}><ChevronLeft size={18}/> Prev</button>
            <button className="reader-nav-btn" onClick={handleNextChapter} disabled={!hasNext}>Next <ChevronRight size={18}/></button>
          </div>
        </div>
        
        <div className="reader-content">
          {readerLoading ? <div style={{marginTop:'30vh'}}><Loader2 size={48} color="var(--accent-primary)" style={{animation:'spin 1s linear infinite'}}/></div> :
           readerPages.length === 0 ? <p style={{color:'#ef4444', marginTop:'30vh', fontSize:'1.2rem', fontWeight:'600'}}>Failed to load pages. Please check your connection.</p> :
           <>
             {readerPages.map((url, i) => (
               <ProxiedImage key={i} src={url} alt={`Page ${i+1}`} className="reader-page" />
             ))}
             <div style={{marginTop:'60px', display:'flex', gap:'20px'}}>
               {!readingChapter.isOffline && (
                 <>
                   <button className="btn-secondary" onClick={handlePrevChapter} disabled={!hasPrev} style={{padding:'14px 30px', fontSize:'1.1rem'}}><ChevronLeft size={20}/> Previous Chapter</button>
                   <button className="btn-primary" onClick={handleNextChapter} disabled={!hasNext} style={{padding:'14px 30px', fontSize:'1.1rem'}}>Next Chapter <ChevronRight size={20}/></button>
                 </>
               )}
               {readingChapter.isOffline && (
                 <button className="btn-primary" onClick={closeReader} style={{padding:'14px 30px', fontSize:'1.1rem'}}>Finish Reading</button>
               )}
             </div>
           </>
          }
        </div>
      </div>
    );
  };

  const renderChapterItem = (chapter) => {
    const label = `Chapter ${chapter.chapter}${chapter.title?` - ${chapter.title}`:''}`;
    const p = downloadProgress[label];
    const fetching = p?.status==='fetching', downloading = p&&p.progress!==undefined&&p.progress<p.total&&!p.error&&!fetching;
    const done = p&&p.progress!==undefined&&p.progress===p.total&&p.total>1, error = p?.error;
    
    return (
      <div key={chapter.id} className="chapter-item">
        <button className="chapter-play" onClick={()=>handleRead(chapter)}>
          <PlayCircle size={24}/>
        </button>
        <div className="chapter-info">
          <div className="chapter-num">Ch. {chapter.chapter} {chapter.title && <span style={{color:'var(--text-subtle)', fontWeight:'500'}}>- {chapter.title}</span>}</div>
          <div className="chapter-meta">
            <span><Users size={14}/> {chapter.group}</span>
            <span><LayoutList size={14}/> {chapter.pages} pages</span>
            <span>{chapter.publishAt}</span>
          </div>
          {downloading && (
            <div className="dl-progress-bar">
              <div className="dl-progress-fill" style={{width:`${(p.progress/p.total)*100}%`}}></div>
            </div>
          )}
          {done && <div style={{color:'#10b981', fontSize:'0.8rem', marginTop:'6px', fontWeight:'700'}}>✓ Saved as PDF</div>}
          {error && <div style={{color:'#FF3366', fontSize:'0.8rem', marginTop:'6px', fontWeight:'600'}}>⚠ {error}</div>}
        </div>
        <button className="dl-btn" disabled={fetching||downloading||done} onClick={e=>handleDownload(e,chapter)}>
          {fetching ? <><Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> Fetching...</> : 
           downloading ? <><Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> {p.progress}/{p.total}</> : 
           done ? <><CheckCircle size={16} color="#10b981"/> Downloaded</> : 
           error ? <><AlertCircle size={16}/> Retry</> : 
           <><Download size={16}/> Download</>}
        </button>
      </div>
    );
  };

  const renderDetailView = () => (
    <div style={{paddingBottom:'40px'}}>
      <div style={{display:'inline-flex', alignItems:'center', gap:'8px', marginBottom:'32px', cursor:'pointer', color:'var(--text-muted)', fontWeight:'600', transition:'0.2s'}} onClick={handleBack} className="back-btn">
        <ArrowLeft size={18}/> Back to Discover
      </div>
      
      <div className="detail-hero">
        <div className="detail-cover-wrapper">
          <div className="detail-cover-glow"></div>
          <ProxiedImage src={selectedManga.cover} alt={selectedManga.title} className="detail-cover" />
        </div>
        
        <div className="detail-info">
          <h1 className="detail-title">{selectedManga.title}</h1>
          <div className="detail-author">{selectedManga.author}</div>
          
          <div className="detail-tags">
            <span className="detail-tag" style={{background:'rgba(255, 51, 102, 0.1)', color:'var(--accent-primary)', borderColor:'rgba(255,51,102,0.3)'}}>
              {selectedManga.status?.toUpperCase()}
            </span>
            {(selectedManga.tags||[]).slice(0,8).map(t => (
              <span key={t} className="detail-tag">{t}</span>
            ))}
          </div>
          
          <div className="detail-desc">{selectedManga.description || 'No description available for this title.'}</div>
          
          <div style={{marginTop:'auto', paddingTop:'24px', display:'flex', gap:'16px'}}>
            <button className="btn-primary" onClick={toggleBookmark}>
              <Heart size={20} fill={isBookmarked ? 'currentColor' : 'none'}/> 
              {isBookmarked ? 'In Library' : 'Save to Library'}
            </button>
            <button className="btn-secondary" onClick={() => { if(filteredChapters.length>0) handleRead(filteredChapters[filteredChapters.length-1]) }}>
              <BookOpen size={20}/> Read First Chapter
            </button>
          </div>
        </div>
      </div>
      
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'24px', borderBottom:'1px solid var(--border-color)', paddingBottom:'16px'}}>
        <div>
          <h2 style={{fontSize:'1.8rem', display:'flex', alignItems:'center', gap:'12px'}}>
            Chapters
            {loadingChapters && <Loader2 size={24} color="var(--accent-primary)" style={{animation:'spin 1s linear infinite'}}/>}
          </h2>
          {loadingChapters && chapterFetchInfo && <div style={{fontSize:'0.9rem', color:'var(--text-muted)', marginTop:'4px'}}>Loading {chapterFetchInfo.fetched} / {chapterFetchInfo.total}</div>}
          {!loadingChapters && chapters.length > 0 && <div style={{fontSize:'0.9rem', color:'var(--text-muted)', marginTop:'4px'}}>{chapters.length} chapters available</div>}
        </div>
        
        {!loadingChapters && filteredChapters.length > 0 && (
          <button className="btn-secondary" onClick={handleDownloadAll} style={{padding:'8px 16px', fontSize:'0.85rem'}}>
            <Download size={16}/> Download All Unread
          </button>
        )}
      </div>
      
      <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
        <button className={`tag-chip ${langFilter==='en'?'active':''}`} onClick={()=>setLangFilter('en')} style={langFilter==='en'?{background:'var(--accent-primary)',color:'white',borderColor:'var(--accent-primary)'}:{}}>
          🇬🇧 English ({enChapters.length})
        </button>
        <button className={`tag-chip ${langFilter==='id'?'active':''}`} onClick={()=>setLangFilter('id')} style={langFilter==='id'?{background:'var(--accent-primary)',color:'white',borderColor:'var(--accent-primary)'}:{}}>
          🇮🇩 Indonesia ({idChapters.length})
        </button>
      </div>
      
      {!loadingChapters && chapters.length === 0 ? <p style={{color:'var(--text-muted)', padding:'40px 0', textAlign:'center', fontSize:'1.1rem'}}>No chapters found for this title.</p> : 
       filteredChapters.length === 0 && !loadingChapters ? <p style={{color:'var(--text-muted)', padding:'40px 0', textAlign:'center', fontSize:'1.1rem'}}>No {langFilter==='en'?'English':'Indonesian'} chapters available.</p> : 
       <div className="chapter-list">{filteredChapters.map(renderChapterItem)}</div>}
    </div>
  );

  const renderDiscover = () => (
    <>
      <div className="filters-container">
        <select className="custom-select" value={filterDemo} onChange={e=>setFilterDemo(e.target.value)}>
          <option value="">Any Demographic</option>
          <option value="shounen">Shounen</option>
          <option value="shoujo">Shoujo</option>
          <option value="seinen">Seinen</option>
          <option value="josei">Josei</option>
        </select>
        <select className="custom-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">Any Status</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="hiatus">Hiatus</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="custom-select" onChange={e=>{
          if(e.target.value && !selectedTags.includes(e.target.value)) setSelectedTags([...selectedTags, e.target.value]);
          e.target.value='';
        }}>
          <option value="">+ Add Tag Filter</option>
          {tagsList.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        
        {selectedTags.length > 0 && (
          <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', marginLeft:'12px', paddingLeft:'12px', borderLeft:'1px solid var(--border-color)'}}>
            {selectedTags.map(tid => {
              const tName = tagsList.find(x=>x.id===tid)?.name || tid;
              return <span key={tid} className="tag-chip" onClick={()=>setSelectedTags(selectedTags.filter(x=>x!==tid))}>{tName} <X size={12}/></span>
            })}
          </div>
        )}
      </div>
      
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'32px'}}>
        <h2 style={{fontSize:'2rem', display:'flex', alignItems:'center', gap:'12px'}}>
          {!searchQuery && selectedTags.length===0 && !filterDemo && !filterStatus ? '🔥 Trending Masterpieces' : '🔍 Exploration Results'}
          {loading && <Loader2 size={28} color="var(--accent-primary)" style={{animation:'spin 1s linear infinite'}}/>}
        </h2>
        {/* Refresh button – shows only on the default (no filter) view */}
        {!searchQuery && selectedTags.length===0 && !filterDemo && !filterStatus && (
          <button
            className="btn-refresh"
            onClick={handleRefreshDiscover}
            disabled={loading}
            title="Get different recommendations"
          >
            <RefreshCw size={18} style={loading ? {animation:'spin 1s linear infinite'} : {}}/>
            Refresh
          </button>
        )}
      </div>
      
      {loading && mangaList.length === 0 ? <div style={{display:'flex', justifyContent:'center', marginTop:'15vh'}}><Loader2 size={60} color="var(--accent-primary)" style={{animation:'spin 1s linear infinite'}}/></div> : (
        <div className="manga-grid">
          {mangaList.map(m => (
            <div key={m.id} className="manga-card" onClick={()=>handleSelectManga(m)}>
              <div className="badge">{m.status}</div>
              <ProxiedImage src={m.cover} alt={m.title} className="manga-cover"/>
              <div className="manga-overlay">
                <div className="manga-title">{m.title}</div>
                <div className="manga-author">{m.author}</div>
                {/* Genre preview chips on hover */}
                {m.tags && m.tags.length > 0 && (
                  <div className="manga-tags-preview">
                    {m.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="manga-tag-chip">{tag}</span>
                    ))}
                    {m.tags.length > 3 && <span className="manga-tag-chip manga-tag-more">+{m.tags.length - 3}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!loading && mangaList.length === 0 && <div style={{gridColumn:'1/-1', textAlign:'center', color:'var(--text-muted)', padding:'80px', fontSize:'1.2rem', fontWeight:'600'}}>The archives yielded no results. Try adjusting your filters.</div>}
        </div>
      )}
    </>
  );

  const renderLibrary = () => (
    <>
      <h2 style={{marginBottom:'32px', fontSize:'2rem'}}>📚 Your Personal Library</h2>
      {libraryList.length === 0 ? (
        <div style={{textAlign:'center', color:'var(--text-subtle)', padding:'10vh 20px'}}>
          <Heart size={64} style={{margin:'0 auto 24px', opacity:0.2}}/>
          <h3 style={{fontSize:'1.5rem', marginBottom:'12px', color:'var(--text-muted)'}}>An empty shelf</h3>
          <p style={{fontSize:'1rem'}}>Save your favorite manga from Discover to curate your collection.</p>
        </div>
      ) : (
        <div className="manga-grid">
          {libraryList.map(m => (
            <div key={m.id} className="manga-card" onClick={()=>{setActiveTab('discover');handleSelectManga(m);}}>
              <div className="badge">{m.status}</div>
              <ProxiedImage src={m.cover} alt={m.title} className="manga-cover"/>
              <div className="manga-overlay">
                <div className="manga-title">{m.title}</div>
                <div className="manga-author">{m.author}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderDownloads = () => (
    <div style={{maxWidth:'900px'}}>
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'32px', borderBottom:'1px solid var(--border-color)', paddingBottom:'20px'}}>
        <h2 style={{fontSize:'2rem'}}>📥 Downloaded Archives</h2>
        {downloadsList.length > 0 && <span style={{color:'var(--text-muted)'}}>Ready to read offline</span>}
      </div>
      
      {downloadsList.length === 0 ? (
        <div style={{textAlign:'center', color:'var(--text-subtle)', padding:'10vh 20px'}}>
          <Download size={64} style={{margin:'0 auto 24px', opacity:0.2}}/>
          <h3 style={{fontSize:'1.5rem', marginBottom:'12px', color:'var(--text-muted)'}}>No offline reading yet</h3>
          <p style={{fontSize:'1rem'}}>Downloaded chapters will appear here as PDFs.</p>
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
          {downloadsList.map((manga, i) => (
            <div key={i} style={{background:'var(--bg-surface)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-lg)', overflow:'hidden'}}>
              <div onClick={()=>setExpandedDl(expandedDl===i?null:i)} style={{padding:'20px 24px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background:expandedDl===i?'var(--bg-surface-hover)':'transparent', transition:'0.2s'}}>
                <div>
                  <div style={{fontFamily:'var(--font-heading)', fontWeight:'700', fontSize:'1.2rem', marginBottom:'6px', textTransform:'capitalize'}}>{manga.name.replace(/_/g,' ')}</div>
                  <div style={{color:'var(--text-muted)', fontSize:'0.9rem', fontWeight:'500'}}><Layers size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> {manga.chapters.length} chapter{manga.chapters.length!==1?'s':''} &bull; {formatSize(manga.totalSize)}</div>
                </div>
                <button className="btn-secondary" onClick={e=>{e.stopPropagation();api.openFolder(manga.path);}} style={{padding:'8px 16px', fontSize:'0.85rem'}}>
                  <FolderOpen size={16}/> View Folder
                </button>
              </div>
              
              {expandedDl === i && (
                <div style={{padding:'12px 24px 24px'}}>
                  {manga.chapters.map((ch, j) => (
                    <div key={j} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:j<manga.chapters.length-1?'1px solid var(--border-color)':'none'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                        <div style={{width:'32px', height:'32px', borderRadius:'8px', background:'rgba(255,51,102,0.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent-primary)'}}>
                          <AlignLeft size={16}/>
                        </div>
                        <div>
                          <div style={{fontWeight:'600', color:'var(--text-main)', textTransform:'capitalize', marginBottom:'2px'}}>{ch.name.replace(/_/g,' ')}</div>
                          <div style={{fontSize:'0.8rem', color:'var(--text-subtle)'}}>PDF Document &bull; {formatSize(ch.size)}</div>
                        </div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        <button onClick={()=>handleReadOffline(manga.name, ch.name)} className="btn-primary" style={{padding:'6px 12px', fontSize:'0.85rem', display:'flex', alignItems:'center'}}>
                          <BookOpen size={14} style={{marginRight:'6px'}}/> Read
                        </button>
                        <button onClick={()=>api.openFolder(ch.path)} style={{background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:'8px'}} className="btn-icon">
                          <FolderOpen size={18}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div style={{maxWidth:'700px'}}>
      <h2 style={{marginBottom:'32px', fontSize:'2rem'}}>⚙️ Preferences</h2>
      
      <div className="settings-panel">
        <h3 className="settings-title">Storage Information</h3>
        <p style={{color:'var(--text-muted)', fontSize:'0.95rem', marginBottom:'20px'}}>Downloads are saved securely in your device's public Download folder under "Download/MangaX".</p>
      </div>

      {/* ─── Gooner Mode ─── */}
      <div className="settings-panel gooner-panel">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'14px'}}>
            <div className={`gooner-icon ${settings.goonerMode ? 'active' : ''}`}>
              <ShieldOff size={22}/>
            </div>
            <div>
              <h3 className="settings-title" style={{marginBottom:'4px'}}>Gooner Mode</h3>
              <p style={{color:'var(--text-muted)', fontSize:'0.9rem'}}>Filter out Boys' Love & Girls' Love genres from all results.</p>
            </div>
          </div>
          <button
            className={`toggle-switch ${settings.goonerMode ? 'on' : 'off'}`}
            onClick={() => handleSaveSettings('goonerMode', !settings.goonerMode)}
            aria-label="Toggle Gooner Mode"
          >
            <span className="toggle-knob"/>
          </button>
        </div>
        <div className="gooner-tags-preview">
          <span style={{fontSize:'0.8rem', color:'var(--text-subtle)', fontWeight:'600', marginRight:'8px'}}>Blacklisted:</span>
          <span className="gooner-tag">Boys' Love</span>
          <span className="gooner-tag">Girls' Love</span>
          <span style={{fontSize:'0.75rem', color:'var(--text-subtle)', marginLeft:'4px'}}>{settings.goonerMode ? '🚫 Active' : '✓ Allowed'}</span>
        </div>
      </div>

      <div className="settings-panel">
        <h3 className="settings-title">Image Quality</h3>
        <p style={{color:'var(--text-muted)', fontSize:'0.95rem', marginBottom:'20px'}}>Select the source quality for downloads and the built-in reader.</p>
        
        <div className="radio-group">
          <label>
            <input type="radio" name="quality" checked={settings.quality==='data'} onChange={()=>handleSaveSettings('quality','data')}/>
            <div className="radio-content">
              <h4>Original Quality (Data)</h4>
              <p>Uncompressed source images. Results in maximum clarity but very large PDF sizes and higher bandwidth usage.</p>
            </div>
          </label>
          <label>
            <input type="radio" name="quality" checked={settings.quality==='dataSaver'} onChange={()=>handleSaveSettings('quality','dataSaver')}/>
            <div className="radio-content">
              <h4>Data Saver (Compressed)</h4>
              <p>MangaDex's optimized web images. Significantly faster loading, lower bandwidth, and smaller PDF sizes with minimal quality loss.</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {readingChapter && renderReader()}
      
      <div className="sidebar">
        <nav style={{display:'flex', width:'100%', justifyContent:'space-around'}}>
          <div className={`nav-item ${activeTab==='discover'?'active':''}`} onClick={()=>switchTab('discover')}><Compass size={22}/> <span>Discover</span></div>
          <div className={`nav-item ${activeTab==='library'?'active':''}`} onClick={()=>switchTab('library')}><Library size={22}/> <span>Library</span></div>
          <div className={`nav-item ${activeTab==='downloads'?'active':''}`} onClick={()=>switchTab('downloads')}><Download size={22}/> <span>Downloads</span></div>
          <div className={`nav-item ${activeTab==='settings'?'active':''}`} onClick={()=>switchTab('settings')}><Settings size={22}/> <span>Settings</span></div>
        </nav>
      </div>
      
      <div className="main-content">
        <div className="header">
          <div className="search-bar">
            <Search size={20} color="var(--text-muted)"/>
            <input type="text" placeholder="Search the archives..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} disabled={!!selectedManga||activeTab!=='discover'}/>
          </div>
        </div>
        
        <div className="content-area">
          {selectedManga ? renderDetailView() : activeTab==='library' ? renderLibrary() : activeTab==='downloads' ? renderDownloads() : activeTab==='settings' ? renderSettings() : renderDiscover()}
        </div>
      </div>
    </div>
  );
}
