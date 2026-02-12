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
  getRedirectResult
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
  User
} from 'lucide-react';

// ========================================================
// 🛠️ 基礎配置與環境變數處理 (與之前設定一致)
// ========================================================
const isCanvas = typeof __app_id !== 'undefined';
const analysisCache = new Map();

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

// ========================================================
// 🧠 輔助函式
// ========================================================
const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

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

// ========================================================
// 📱 主程式
// ========================================================
const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [spellCheck, setSpellCheck] = useState(null);
  const typingTimer = useRef(null);

  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const isTransitioning = useRef(false);

  const speak = (text, lang) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    ut.rate = 0.9;
    window.speechSynthesis.speak(ut);
  };

  // ========================================================
  // 🔐 認證邏輯 (RULE 3 - 與登入頭像邏輯一致)
  // ========================================================
  useEffect(() => {
    const initAuth = async () => {
      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult) return;

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // 如果沒有 token 也不在登入狀態，保持 loading 讓使用者選登入方式
        }
      } catch (err) {
        console.error("Auth Init Error", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err) { 
      console.error("Google Login Error:", err);
    }
  };

  const handleAnonymousLogin = async () => {
    try { 
      setAuthLoading(true);
      await signInAnonymously(auth); 
    } catch (err) { 
      console.error(err); 
    } finally {
      setAuthLoading(false);
    }
  };

  // ========================================================
  // 📊 資料同步 (Firestore RULE 1 & 2)
  // ========================================================
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
      (error) => console.warn("Firestore Error:", error.message)
    );
    return () => unsubscribe();
  }, [user]);

  // ========================================================
  // 🔍 自動翻譯與拼寫檢查
  // ========================================================
  const checkAndTranslate = async (term) => {
    if (!term || term.length < 2 || isProcessing) return;
    setIsProcessing(true);
    setSpellCheck(null);
    try {
      if (langMode === 'EN') {
        const checkUrl = `https://api.datamuse.com/words?sp=${term}&max=1`;
        const res = await fetch(checkUrl);
        const data = await res.json();
        if (data.length > 0 && data[0].word.toLowerCase() !== term.toLowerCase()) {
          setSpellCheck(data[0].word);
        }
      }
      const sourceLang = langMode === 'JP' ? 'ja' : 'en';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=zh-TW&dt=t&q=${encodeURIComponent(term)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.[0]?.[0]) setNewWord(prev => ({ ...prev, definition: String(data[0][0][0]) }));
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleInputChange = (val) => {
    setNewWord(prev => ({ ...prev, term: val }));
    setSearchTerm(val);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => checkAndTranslate(val), 800);
  };

  const addWord = async (e) => {
    if (e) e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    
    const term = langMode === 'EN' ? capitalize(newWord.term.trim()) : newWord.term.trim();
    if (words.some(w => w.lang === langMode && w.term.toLowerCase() === term.toLowerCase())) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 1500);
      return;
    }

    try {
      const userVocabRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
      await addDoc(userVocabRef, {
        term,
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
      setSearchTerm('');
      setSpellCheck(null);
    } catch (e) { console.error("Add Error", e); }
  };

  // ========================================================
  // 🤖 AI 分析
  // ========================================================
  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    const cacheKey = `${word.lang}:${word.term.toLowerCase()}`;
    if (analysisCache.has(cacheKey)) {
      setExplanation(analysisCache.get(cacheKey));
      return;
    }
    setExplanation(null);
    setIsExplaining(true);
    try {
      const prompt = `你是一個語言專家。分析單字 "${word.term}" (${word.lang === 'JP' ? '日文' : '英文'})。
      回傳格式必須為 JSON 物件，內容須為繁體中文：
      {
        "phonetic": "讀法(日文給平假名, 英文給音標)",
        "pos": "詞性(繁體中文)",
        "example_original": "單句例句(原文)",
        "example_zh": "例句翻譯(繁體中文)",
        "synonyms": ["該語言單字1 (解釋1)", "該語言單字2 (解釋2)"],
        "tips": "記憶技巧"
      }`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      });
      const result = await res.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        analysisCache.set(cacheKey, parsed);
        setExplanation(parsed);
      }
    } catch (e) { console.error("AI Error", e); } finally { setIsExplaining(false); }
  };

  // ========================================================
  // 🏁 測驗邏輯
  // ========================================================
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
    setQuizFeedback({ status: isCorrect ? 'correct' : 'wrong', message: isCorrect ? '🎯 完美擊中！' : `🍃 答案是：${quizWord.definition}` });
    
    if (isCorrect) {
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const newCorrect = stats.correct + 1;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(docRef, { 
        "stats.mc": { total: stats.total + 1, correct: newCorrect, archived: newCorrect >= 3 } 
      });
    }
    setTimeout(() => { setQuizFeedback(null); generateQuiz(); }, 1600);
  };

  const progress = words.filter(w => w.lang === langMode).length > 0 
    ? (words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length / words.filter(w => w.lang === langMode).length) * 100 
    : 0;

  // ========================================================
  // 🖼️ 渲染組件
  // ========================================================
  if (authLoading) return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
      <div className="relative">
        <Loader2 className="animate-spin text-[#2D4F1E] w-16 h-16" />
        <Compass className="absolute inset-0 m-auto text-[#2D4F1E]/20 w-8 h-8" />
      </div>
      <p className="mt-6 font-black text-[#2D4F1E] tracking-[0.2em] animate-pulse text-sm">正在進入獵場...</p>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-[#E8F0E5] rounded-full flex items-center justify-center mb-8 border-4 border-white shadow-xl">
        <Compass className="w-12 h-12 text-[#2D4F1E]" />
      </div>
      <h1 className="text-3xl font-black text-[#2D4F1E] mb-4 tracking-tighter">VOCAB HUNTER</h1>
      <p className="text-[#6B7C65] mb-12 max-w-xs leading-relaxed">捕捉每一個陌生的詞彙，轉化為你的知識獵物。</p>
      
      <div className="space-y-4 w-full max-w-sm">
        <button 
          onClick={handleGoogleLogin}
          className="w-full bg-[#2D4F1E] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D4F1E]/20 flex items-center justify-center gap-3 hover:scale-105 transition-all"
        >
          <User className="w-5 h-5" /> 使用 Google 登入
        </button>
        <button 
          onClick={handleAnonymousLogin}
          className="w-full bg-white border-2 border-[#E8F0E5] text-[#2D4F1E] py-4 rounded-2xl font-bold hover:bg-[#F5F8F4] transition-all"
        >
          訪客試用
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#2D4F1E] font-sans pb-24">
      {/* Top Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 px-5 py-4 flex items-center justify-between border-b border-[#E8F0E5]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2D4F1E] rounded-xl flex items-center justify-center shadow-lg shadow-[#2D4F1E]/20">
            <Compass className="w-6 h-6 text-[#FDFCF8]" />
          </div>
          <span className="font-black text-xl tracking-tighter">HUNTER</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLangMode(prev => prev === 'EN' ? 'JP' : 'EN')}
            className="bg-[#E8F0E5] px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border border-[#D5E2D1]"
          >
            <Layers className="w-3.5 h-3.5" /> {langMode === 'EN' ? 'ENGLISH' : 'JAPANESE'}
          </button>
          
          <div className="relative group">
            {user.photoURL ? (
              <img src={user.photoURL} className="w-10 h-10 rounded-xl border-2 border-white shadow-md cursor-pointer" alt="Avatar" />
            ) : (
              <div className="w-10 h-10 bg-[#E8F0E5] rounded-xl flex items-center justify-center border-2 border-white shadow-md cursor-pointer">
                <UserCircle className="w-6 h-6 text-[#2D4F1E]" />
              </div>
            )}
            <button 
              onClick={() => signOut(auth)}
              className="absolute right-0 top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-red-500 p-3 rounded-xl shadow-xl border border-red-50 flex items-center gap-2 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" /> 登出
            </button>
          </div>
        </div>
      </header>

      {/* Hero Stats */}
      <section className="p-5">
        <div className="bg-[#2D4F1E] rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-[#2D4F1E]/20">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[#C5D9BE] text-xs font-black tracking-widest uppercase mb-2">
              <Award className="w-4 h-4" /> {langMode === 'EN' ? 'Hunter Rank' : 'ハンターランク'}
            </div>
            <h2 className="text-4xl font-black mb-6">Lv.{Math.floor(progress/10) + 1}</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end text-xs font-bold">
                <span>捕獲進度</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#A5D6A7] transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(165,214,167,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
          <Flame className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 rotate-12" />
        </div>
      </section>

      {/* Main Content Area */}
      <main className="px-5">
        {activeTab === 'list' ? (
          <div className="space-y-6">
            {/* Search & Add */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-[#E8F0E5] focus-within:ring-2 ring-[#2D4F1E]/10 transition-all">
                <div className="flex items-center gap-4">
                  <div className="bg-[#FDFCF8] p-3 rounded-2xl">
                    <Search className="w-5 h-5 text-[#6B7C65]" />
                  </div>
                  <input 
                    placeholder={langMode === 'EN' ? "輸入單字 (Capture new word...)" : "単語を入力..."}
                    className="flex-1 bg-transparent border-none outline-none font-bold text-lg placeholder:text-[#BCC6B9]"
                    value={newWord.term}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addWord()}
                  />
                  {(newWord.term || isProcessing) && (
                    <button 
                      onClick={addWord}
                      disabled={isProcessing || !newWord.definition}
                      className="bg-[#2D4F1E] text-white p-3 rounded-2xl shadow-lg disabled:opacity-30 transition-all hover:scale-110 active:scale-95"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    </button>
                  )}
                </div>
                
                {spellCheck && (
                  <div className="mt-4 pt-4 border-t border-[#F1F5F0] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-[#6B7C65]">
                      你是指 <button onClick={() => handleInputChange(spellCheck)} className="text-[#2D4F1E] underline">{spellCheck}</button> 嗎？
                    </span>
                  </div>
                )}
                
                {newWord.definition && !isProcessing && (
                  <div className="mt-4 pt-4 border-t border-[#F1F5F0] animate-in fade-in slide-in-from-top-2">
                    <span className="text-xs font-black text-[#6B7C65] uppercase tracking-wider block mb-1">AUTO TRANSLATE</span>
                    <p className="text-[#2D4F1E] font-bold text-lg">{newWord.definition}</p>
                  </div>
                )}
              </div>
              {duplicateAlert && (
                <div className="absolute -top-12 left-0 right-0 flex justify-center animate-bounce">
                  <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-xs font-black shadow-lg border border-amber-200">
                    ⚠️ 此獵物已在清單中
                  </span>
                </div>
              )}
            </div>

            {/* List Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-[#6B7C65]">Collection ({words.filter(w => w.lang === langMode).length})</h3>
            </div>

            {/* Word List */}
            <div className="grid gap-4">
              {words.filter(w => w.lang === langMode).length === 0 ? (
                <div className="py-20 text-center space-y-4 opacity-40">
                  <div className="w-16 h-16 bg-[#E8F0E5] rounded-full mx-auto flex items-center justify-center">
                    <Target className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-bold italic">目前還沒有捕獲紀錄...</p>
                </div>
              ) : (
                words.filter(w => w.lang === langMode).map(word => (
                  <div 
                    key={word.id}
                    className="group bg-white rounded-[2rem] p-5 shadow-sm border border-[#E8F0E5] hover:shadow-xl hover:shadow-[#2D4F1E]/5 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-black tracking-tight">{word.term}</h4>
                          <button 
                            onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }}
                            className="p-2 bg-[#FDFCF8] rounded-xl hover:bg-[#E8F0E5] transition-colors"
                          >
                            <Volume2 className="w-4 h-4 text-[#6B7C65]" />
                          </button>
                        </div>
                        <p className="text-[#6B7C65] font-medium">{word.definition}</p>
                      </div>
                      <div className="flex gap-2">
                        {word.stats?.mc?.archived && <Trophy className="w-5 h-5 text-amber-400 fill-amber-400" />}
                        <button 
                          onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id))}
                          className="opacity-0 group-hover:opacity-100 p-2 text-red-200 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-6 flex items-center gap-2">
                      <button 
                        onClick={() => fetchExplanation(word)}
                        className="flex-1 bg-[#FDFCF8] py-3 rounded-2xl text-xs font-black border border-[#E8F0E5] flex items-center justify-center gap-2 hover:bg-[#2D4F1E] hover:text-white transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> AI 深度分析
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Quiz Tab */
          <div className="min-h-[50vh] flex flex-col justify-center gap-8 py-10">
            {words.filter(w => w.lang === langMode).length < 3 ? (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-[#E8F0E5] rounded-full mx-auto flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-[#6B7C65]" />
                </div>
                <h3 className="text-xl font-black">獵場封鎖中</h3>
                <p className="text-sm text-[#6B7C65] font-medium leading-relaxed px-10">
                  你需要至少捕獲 3 個單字，<br/>才能開啟測驗模式。
                </p>
                <button 
                  onClick={() => setActiveTab('list')}
                  className="bg-[#2D4F1E] text-white px-8 py-3 rounded-2xl font-black text-sm"
                >
                  去捕捉單字
                </button>
              </div>
            ) : quizWord && (
              <div className="animate-in zoom-in-95 duration-300">
                <div className="text-center mb-12">
                  <div className="inline-block bg-[#E8F0E5] px-4 py-1 rounded-full text-[10px] font-black tracking-widest text-[#2D4F1E] mb-4 uppercase">
                    QUIZ MODE
                  </div>
                  <h2 className="text-5xl font-black tracking-tighter mb-4">{quizWord.term}</h2>
                  <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-3 bg-white rounded-2xl shadow-sm border border-[#E8F0E5]">
                    <Volume2 className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid gap-3">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuizAnswer(opt)}
                      disabled={!!quizFeedback}
                      className={`
                        w-full py-5 px-6 rounded-[1.8rem] font-bold text-left transition-all relative overflow-hidden border-2
                        ${quizFeedback ? (opt === quizWord.definition ? 'bg-green-50 border-green-200' : 'bg-white border-transparent opacity-50') : 'bg-white border-transparent shadow-sm hover:border-[#2D4F1E] hover:scale-[1.02]'}
                      `}
                    >
                      <span className="relative z-10">{opt}</span>
                    </button>
                  ))}
                </div>

                {quizFeedback && (
                  <div className={`mt-8 text-center animate-in slide-in-from-bottom-4 font-black text-xl ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-amber-600'}`}>
                    {quizFeedback.message}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Detail Overlay (AI Explanation) */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-[#2D4F1E]/40 backdrop-blur-sm" onClick={() => { setSelectedWord(null); setExplanation(null); }} />
          <div className="relative w-full max-w-lg bg-white sm:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-3xl font-black mb-1">{selectedWord.term}</h3>
                  <p className="text-lg font-bold text-[#6B7C65]">{selectedWord.definition}</p>
                </div>
                <button onClick={() => { setSelectedWord(null); setExplanation(null); }} className="p-2 hover:bg-[#FDFCF8] rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {isExplaining ? (
                <div className="py-20 flex flex-col items-center gap-6">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-[#2D4F1E] animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-[#2D4F1E]/30" />
                  </div>
                  <p className="text-xs font-black tracking-widest text-[#6B7C65] animate-pulse">AI 正在深度掃描獵物屬性...</p>
                </div>
              ) : explanation ? (
                <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#FDFCF8] p-4 rounded-3xl border border-[#E8F0E5]">
                      <span className="text-[10px] font-black text-[#6B7C65] uppercase tracking-wider block mb-1">音標/讀法</span>
                      <p className="font-bold">{explanation.phonetic}</p>
                    </div>
                    <div className="bg-[#FDFCF8] p-4 rounded-3xl border border-[#E8F0E5]">
                      <span className="text-[10px] font-black text-[#6B7C65] uppercase tracking-wider block mb-1">詞性</span>
                      <p className="font-bold">{explanation.pos}</p>
                    </div>
                  </div>

                  <div className="bg-[#E8F0E5]/30 p-5 rounded-3xl border border-[#D5E2D1]">
                    <span className="text-[10px] font-black text-[#2D4F1E] uppercase tracking-wider block mb-3">使用範例</span>
                    <p className="text-lg font-medium italic mb-2 leading-relaxed">"{explanation.example_original}"</p>
                    <p className="text-sm font-bold text-[#6B7C65]">{explanation.example_zh}</p>
                  </div>

                  {explanation.synonyms?.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] font-black text-[#6B7C65] uppercase tracking-wider block">相關近義</span>
                      <div className="flex flex-wrap gap-2">
                        {explanation.synonyms.map((s, i) => (
                          <span key={i} className="bg-white px-4 py-2 rounded-2xl text-xs font-bold border border-[#E8F0E5] shadow-sm">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <span className="text-[10px] font-black text-[#6B7C65] uppercase tracking-wider block">記憶建議</span>
                    <p className="text-sm font-medium leading-relaxed bg-amber-50/50 p-4 rounded-3xl border border-amber-100 italic text-amber-800">
                      💡 {explanation.tips}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-red-400 font-bold">分析失敗，請重試</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-6 right-6 z-40">
        <div className="bg-[#2D4F1E]/95 backdrop-blur-xl rounded-[2.5rem] p-3 flex justify-between items-center shadow-2xl shadow-[#2D4F1E]/40 border border-white/10">
          <button 
            onClick={() => setActiveTab('list')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${activeTab === 'list' ? 'text-[#A5D6A7]' : 'text-white/40'}`}
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Collection</span>
          </button>
          
          <div className="w-px h-8 bg-white/10" />
          
          <button 
            onClick={() => setActiveTab('quiz')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${activeTab === 'quiz' ? 'text-[#A5D6A7]' : 'text-white/40'}`}
          >
            <PlayCircle className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Hunting</span>
          </button>
        </div>
      </nav>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #FDFCF8; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E8F0E5; border-radius: 10px; }
      `}} />
    </div>
  );
};

export default App;
