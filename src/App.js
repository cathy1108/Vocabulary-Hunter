import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  query
} from 'firebase/firestore';
import { 
  Volume2, 
  Trash2, 
  Compass, 
  Trophy, 
  Search, 
  LogOut, 
  Loader2, 
  BookOpen, 
  Sparkles,
  X,
  Plus,
  Target,
  Layers,
  PlayCircle,
  AlertCircle,
  UserCircle,
  Award,
  Flame,
  User,
  ChevronRight
} from 'lucide-react';

// ========================================================
// 🛠️ 配置與初始化
// ========================================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      // 這是當環境變數不存在時的備援。
      // 請確保在正式環境中使用 __firebase_config 注入。
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: "vocabularyh-4c909.firebaseapp.com",
      projectId: "vocabularyh-4c909",
      storageBucket: "vocabularyh-4c909.firebasestorage.app",
      messagingSenderId: "924954723346",
      appId: "1:924954723346:web:cc792c2fdd317fb96684cb",
      measurementId: "G-C7KZ6SPTVC"
    };

const geminiApiKey = isCanvas ? "" : (process.env.REACT_APP_GEMINI_KEY || "");
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

const analysisCache = new Map();

const fetchWithRetry = async (url, options, maxRetries = 5) => {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [spellCheck, setSpellCheck] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const typingTimer = useRef(null);

  // 測驗狀態
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null);
  const isTransitioning = useRef(false);

  // 🔈 語音功能
  const speak = (text, lang) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    ut.rate = 0.9;
    window.speechSynthesis.speak(ut);
  };

  // 🔐 認證邏輯：解決 Message Channel Closed 錯誤
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 設定持久化
        await setPersistence(auth, browserLocalPersistence);

        // 核心修正：主動監聽 Redirect 結果，這在手機 Webview 尤其重要
        try {
          const result = await getRedirectResult(auth);
          if (result?.user) {
            setUser(result.user);
          }
        } catch (redirectErr) {
          // 這裡捕捉因 message channel 關閉導致的異步錯誤，但不中斷流程
          console.warn("Auth Redirect handled with warning:", redirectErr.message);
        }

        // 處理環境預載 Token
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth Initialization Failed:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      setIsLoggingIn(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      // 偵測是否為行動裝置
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // 手機端強制使用 Redirect，這是解決該錯誤的最徹底方法
        await signInWithRedirect(auth, provider);
      } else {
        try {
          await signInWithPopup(auth, provider);
        } catch (popupErr) {
          // 如果 Popup 被攔截，自動降級到 Redirect
          if (popupErr.code === 'auth/popup-blocked') {
            await signInWithRedirect(auth, provider);
          } else {
            throw popupErr;
          }
        }
      }
    } catch (err) {
      console.error("Login Error:", err);
      setIsLoggingIn(false);
      setLoginError("無法啟動登入流程，請檢查瀏覽器設定。");
    }
  };

  const handleAnonymousLogin = async () => {
    try {
      setIsLoggingIn(true);
      await signInAnonymously(auth);
    } catch (err) {
      setLoginError("匿名登入失敗。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 📊 資料監聽 (Firestore)
  useEffect(() => {
    if (!user) {
      setWords([]);
      return;
    }
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(query(wordsRef), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWords(data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
      },
      (err) => console.warn("Firestore Listener Error:", err)
    );
    return () => unsubscribe();
  }, [user]);

  // 📝 字彙邏輯
  const checkAndTranslate = async (term) => {
    if (!term || term.length < 2 || isProcessing) return;
    setIsProcessing(true);
    setSpellCheck(null);
    try {
      if (langMode === 'EN') {
        const res = await fetch(`https://api.datamuse.com/words?sp=${term}&max=1`);
        const data = await res.json();
        if (data.length > 0 && data[0].word.toLowerCase() !== term.toLowerCase()) {
          setSpellCheck(data[0].word);
        }
      }
      const sl = langMode === 'JP' ? 'ja' : 'en';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=zh-TW&dt=t&q=${encodeURIComponent(term)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.[0]?.[0]) setNewWord(prev => ({ ...prev, definition: String(data[0][0][0]) }));
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleInputChange = (val) => {
    setNewWord(prev => ({ ...prev, term: val }));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => checkAndTranslate(val), 800);
  };

  const addWord = async (e) => {
    if (e) e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    
    const term = langMode === 'EN' 
      ? newWord.term.trim().charAt(0).toUpperCase() + newWord.term.trim().slice(1)
      : newWord.term.trim();

    if (words.some(w => w.lang === langMode && w.term.toLowerCase() === term.toLowerCase())) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 1500);
      return;
    }

    try {
      const vocabRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
      await addDoc(vocabRef, {
        term,
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
      setSpellCheck(null);
    } catch (e) { console.error("Firestore Add Error", e); }
  };

  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    const key = `${word.lang}:${word.term.toLowerCase()}`;
    if (analysisCache.has(key)) {
      setExplanation(analysisCache.get(key));
      return;
    }
    setExplanation(null);
    setIsExplaining(true);
    try {
      const prompt = `分析單字 "${word.term}" (${word.lang})。回傳 JSON：{"phonetic": "音標", "pos": "詞性", "example_original": "例句", "example_zh": "翻譯", "synonyms": ["同義1", "同義2"], "tips": "記憶技巧"}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      const result = await res.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        analysisCache.set(key, parsed);
        setExplanation(parsed);
      }
    } catch (e) { console.error("AI Error", e); } finally { setIsExplaining(false); }
  };

  const generateQuiz = () => {
    const pool = words.filter(w => w.lang === langMode);
    if (pool.length < 3) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const others = pool.filter(w => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.definition);
    setQuizWord(target);
    setOptions([...others, target.definition].sort(() => 0.5 - Math.random()));
    isTransitioning.current = false;
  };

  useEffect(() => { if (activeTab === 'quiz') generateQuiz(); }, [activeTab, langMode, words.length]);

  const handleQuizAnswer = async (ans) => {
    if (quizFeedback || !quizWord || isTransitioning.current || !user) return;
    isTransitioning.current = true;
    const isCorrect = ans === quizWord.definition;
    setQuizFeedback({ status: isCorrect ? 'correct' : 'wrong', message: isCorrect ? '🎯 命中紅心！' : `🍃 正解是：${quizWord.definition}` });
    
    if (isCorrect) {
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const newCorrect = stats.correct + 1;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(docRef, { "stats.mc": { total: stats.total + 1, correct: newCorrect, archived: newCorrect >= 3 } });
    }
    setTimeout(() => { setQuizFeedback(null); generateQuiz(); }, 1600);
  };

  const currentLangWords = words.filter(w => w.lang === langMode);
  const progress = currentLangWords.length > 0 
    ? (currentLangWords.filter(w => w.stats?.mc?.archived).length / currentLangWords.length) * 100 
    : 0;

  if (authLoading) return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-[#2D4F1E] w-12 h-12" />
      <p className="mt-4 font-black text-[#2D4F1E] tracking-widest text-sm animate-pulse">正在開啟獵場...</p>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6 text-gray-900">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[#2D4F1E] rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6">
            <Target className="text-white w-10 h-10" />
          </div>
        </div>
        <h1 className="text-3xl font-black text-center mb-2">VocabHunter</h1>
        <p className="text-center text-gray-500 mb-8 px-4 text-sm">捕捉語感，精準記憶。<br/>AI 驅動的跨語言單字獵手。</p>
        <div className="space-y-4">
          <button 
            onClick={handleGoogleLogin} disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-2xl font-bold hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
          >
            {isLoggingIn ? <Loader2 className="animate-spin w-5 h-5" /> : <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="G" />}
            Google 帳號登入
          </button>
          <button 
            onClick={handleAnonymousLogin} disabled={isLoggingIn}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-black active:scale-95 transition-all disabled:opacity-50"
          >
            匿名試玩
          </button>
        </div>
        {loginError && <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {loginError}</div>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCF8] pb-24 font-sans text-gray-900">
      {/* 頂部 */}
      <nav className="sticky top-0 z-50 bg-[#FDFCF8]/90 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2D4F1E] rounded-lg flex items-center justify-center text-white"><Target size={18} /></div>
          <span className="font-black text-xl tracking-tight">VocabHunter</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLangMode(langMode === 'EN' ? 'JP' : 'EN')}
            className="bg-white border-2 border-gray-200 px-4 py-1.5 rounded-full text-xs font-black shadow-sm"
          >
            {langMode === 'EN' ? '🇺🇸 EN' : '🇯🇵 JP'}
          </button>
          <button onClick={() => signOut(auth)} className="text-gray-400 p-1 hover:text-red-500"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="max-w-xl mx-auto px-6 pt-6">
        {/* 進度條 */}
        <div className="mb-8">
          <div className="flex justify-between items-end mb-2">
            <div>
              <h2 className="text-sm font-black text-[#2D4F1E] uppercase tracking-widest">Mastery</h2>
              <p className="text-3xl font-black">{Math.round(progress)}%</p>
            </div>
            <span className="text-xs font-bold text-gray-400">Captured: {currentLangWords.length}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D4F1E] transition-all duration-1000" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6">
            {/* 新增區塊 */}
            <div className={`bg-white p-2 rounded-3xl shadow-lg border border-gray-100 ${duplicateAlert ? 'animate-shake border-red-200' : ''}`}>
              <div className="flex items-center gap-2 px-3 py-1">
                <Plus className="text-[#2D4F1E]" size={20} />
                <input 
                  value={newWord.term}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={langMode === 'EN' ? "Capture a new word..." : "單字捕獲中..."}
                  className="w-full py-3 bg-transparent outline-none font-bold placeholder:text-gray-300"
                />
                {isProcessing && <Loader2 className="animate-spin text-gray-300" size={18} />}
              </div>
              
              {newWord.definition && (
                <div className="mt-1 border-t border-gray-50 p-4 animate-fade-in">
                  <input 
                    value={newWord.definition}
                    onChange={(e) => setNewWord(prev => ({ ...prev, definition: e.target.value }))}
                    className="w-full text-sm text-gray-500 italic bg-transparent outline-none"
                  />
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex gap-2">
                      {spellCheck && (
                        <button onClick={() => handleInputChange(spellCheck)} className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-md font-bold">
                          修正為: {spellCheck}?
                        </button>
                      )}
                    </div>
                    <button onClick={addWord} className="bg-[#2D4F1E] text-white px-6 py-2 rounded-xl text-sm font-black active:scale-90 transition-transform">ADD</button>
                  </div>
                </div>
              )}
            </div>

            {/* 字卡列表 */}
            <div className="space-y-3">
              {currentLangWords.map(word => (
                <div 
                  key={word.id} onClick={() => fetchExplanation(word)}
                  className="group bg-white p-5 rounded-2xl border border-gray-100 hover:border-[#2D4F1E] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-black group-hover:text-[#2D4F1E]">{word.term}</h3>
                      <p className="text-sm text-gray-400 font-medium mt-1">{word.definition}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {word.stats?.mc?.archived && <div className="bg-[#2D4F1E] text-white p-1 rounded-full"><Award size={14} /></div>}
                      <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="text-gray-300 hover:text-blue-500"><Volume2 size={18} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* 測驗模式 */
          <div className="py-10">
            {quizWord ? (
              <div className="text-center">
                <div className="inline-block p-4 bg-white rounded-2xl shadow-sm border border-gray-100 mb-8">
                  <h3 className="text-4xl font-black">{quizWord.term}</h3>
                  <button onClick={() => speak(quizWord.term, quizWord.lang)} className="mt-2 text-[#2D4F1E] opacity-50"><Volume2 size={24} className="mx-auto" /></button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {options.map((opt, i) => (
                    <button
                      key={i} onClick={() => handleQuizAnswer(opt)} disabled={!!quizFeedback}
                      className={`py-4 px-6 rounded-2xl font-bold border-2 transition-all active:scale-95 ${
                        quizFeedback?.status === 'correct' && opt === quizWord.definition ? 'bg-green-50 border-green-500 text-green-700' :
                        quizFeedback?.status === 'wrong' && opt === quizWord.definition ? 'bg-green-50 border-green-500 text-green-700' :
                        quizFeedback?.status === 'wrong' && opt !== quizWord.definition ? 'bg-red-50 border-red-200 text-red-300' :
                        'bg-white border-gray-100 hover:border-[#2D4F1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {quizFeedback && <div className={`mt-8 p-4 rounded-2xl font-black animate-bounce ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-amber-600'}`}>{quizFeedback.message}</div>}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                <Layers className="mx-auto text-gray-200 mb-4" size={48} />
                <p className="text-gray-400 font-bold">需要至少 3 個單字來啟動 Hunt</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 底部導覽 */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-gray-900 rounded-2xl shadow-2xl p-2 flex items-center justify-between z-40">
        <button onClick={() => setActiveTab('list')} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${activeTab === 'list' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400'}`}>
          <BookOpen size={20} /><span className="text-[10px] font-black uppercase tracking-widest">Library</span>
        </button>
        <button onClick={() => setActiveTab('quiz')} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${activeTab === 'quiz' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400'}`}>
          <Target size={20} /><span className="text-[10px] font-black uppercase tracking-widest">Hunt</span>
        </button>
      </footer>

      {/* 詳細視窗 */}
      {selectedWord && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedWord(null)} />
          <div className="relative w-full max-w-lg bg-[#FDFCF8] rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden animate-slide-up shadow-2xl max-h-[85vh] flex flex-col">
            <div className="p-8 pb-4 flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-4xl font-black tracking-tight">{selectedWord.term}</h2>
                  <button onClick={() => speak(selectedWord.term, selectedWord.lang)} className="text-[#2D4F1E] hover:scale-110 transition-transform"><Volume2 size={24} /></button>
                </div>
                {explanation ? <p className="text-[#2D4F1E] font-bold opacity-60">{explanation.phonetic} · {explanation.pos}</p> : <div className="h-6 w-32 bg-gray-100 animate-pulse rounded-full" />}
              </div>
              <button onClick={() => setSelectedWord(null)} className="bg-gray-100 p-2 rounded-full text-gray-400"><X size={20} /></button>
            </div>
            <div className="p-8 pt-0 overflow-y-auto custom-scrollbar">
              {!explanation ? (
                <div className="space-y-4"><div className="h-4 bg-gray-100 animate-pulse rounded w-3/4" /><div className="h-4 bg-gray-100 animate-pulse rounded w-1/2" /></div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 flex items-center gap-2"><Sparkles size={12} className="text-[#2D4F1E]" /> AI Analysis</h4>
                    <p className="text-lg font-bold leading-relaxed mb-2">"{explanation.example_original}"</p>
                    <p className="text-sm text-gray-400 font-medium italic">{explanation.example_zh}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-3">Synonyms</h4>
                      <ul className="space-y-2">{explanation.synonyms.map((s, i) => (<li key={i} className="text-xs font-bold text-blue-700/70">{s}</li>))}</ul>
                    </div>
                    <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100/50">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-3">Memory Tip</h4>
                      <p className="text-xs font-bold text-amber-700/70 leading-relaxed">{explanation.tips}</p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      if(window.confirm('確定要移除嗎？')) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', selectedWord.id));
                        setSelectedWord(null);
                      }
                    }}
                    className="w-full py-4 text-xs font-black text-gray-300 hover:text-red-500 transition-colors uppercase tracking-widest"
                  >
                    Delete from Library
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        body { overflow-x: hidden; touch-action: manipulation; }
        button { -webkit-tap-highlight-color: transparent; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default App;
