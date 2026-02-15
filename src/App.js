import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Medal,
  Flame,
  Crown,
  Zap,
  Star,
  Ghost,
  Eye,
  Gem,
  ShieldCheck,
  Smartphone,
  CheckCircle2
} from 'lucide-react';

// ========================================================
// 🛠️ 基礎配置與環境變數處理
// ========================================================
const isCanvas = typeof __app_id !== 'undefined';
const analysisCache = new Map();


// ========================================================
// 🛠️ Firebase 配置修復 (針對 404 init.json 錯誤)
// ========================================================

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
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
const provider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

// ========================================================
// 🎉 彩帶動畫元件
// ========================================================
const Confetti = () => {
  const pieces = useMemo(() => {
    return Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2.5 + Math.random() * 2.5,
      color: ['#FFD700', '#FF4500', '#FF1493', '#00BFFF', '#32CD32', '#9370DB', '#FFFFFF'][Math.floor(Math.random() * 7)],
      size: 6 + Math.random() * 12,
      rotation: Math.random() * 360
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[120] overflow-hidden">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute top-[-20px]"
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: 0.9,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s infinite`
          }}
        />
      ))}
    </div>
  );
};

// ========================================================
// 🏆 勳章門檻配置
// ========================================================
const getBadgeInfo = (count) => {
  if (count >= 10000) return { label: "真．全知之眼", icon: <Eye />, color: "from-stone-900 via-yellow-600 to-black", threshold: 10000 };
  if (count >= 5000) return { label: "博學聖賢", icon: <Ghost />, color: "from-indigo-900 to-blue-800", threshold: 5000 };
  if (count >= 3000) return { label: "語文宗師", icon: <Gem />, color: "from-fuchsia-600 to-purple-900", threshold: 3000 };
  if (count >= 1000) {
    const step = Math.floor(count / 200) * 200;
    return { label: `${step} 斬傳說`, icon: <ShieldCheck />, color: "from-yellow-500 to-amber-700", threshold: step };
  }
  if (count >= 200) {
    const step = Math.floor(count / 50) * 50;
    return { label: `${step} 斬獵人`, icon: <Zap />, color: "from-purple-500 to-indigo-600", threshold: step };
  }
  if (count >= 150) return { label: "資深獵人", icon: <Award />, color: "from-blue-400 to-blue-600", threshold: 150 };
  if (count >= 100) return { label: "百單大師", icon: <Star />, color: "from-cyan-400 to-blue-500", threshold: 100 };
  if (count >= 80) return { label: "卓越獵手", icon: <Medal />, color: "from-emerald-400 to-teal-600", threshold: 80 };
  if (count >= 50) return { label: "精英學徒", icon: <Target />, color: "from-green-400 to-emerald-500", threshold: 50 };
  if (count >= 30) return { label: "進階行者", icon: <Flame />, color: "from-orange-400 to-red-500", threshold: 30 };
  if (count >= 10) return { label: "初試啼聲", icon: <Sparkles />, color: "from-amber-400 to-orange-400", threshold: 10 };
  if (count >= 1) return { label: "見習獵人", icon: <Sparkles />, color: "from-stone-400 to-stone-600", threshold: 1 };
  return null;
};

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

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [errorMessage, setErrorMessage] = useState(""); 
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
  const [toast, setToast] = useState(null); 

  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const [showBadge, setShowBadge] = useState(null);
  const lastBadgedCount = useRef(-1); 
  const isTransitioning = useRef(false);

  const speak = (text, lang) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    ut.rate = 0.9;
    window.speechSynthesis.speak(ut);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  // 🔐 認證邏輯與 Logo 初始化
  useEffect(() => {
    document.title = "VocabHunter | 智慧單字獵場";
    const logoUrl = "/logo.png";
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon'; link.href = logoUrl;
    document.getElementsByTagName('head')[0].appendChild(link);

    const appleLink = document.querySelector("link[rel='apple-touch-icon']") || document.createElement('link');
    appleLink.rel = 'apple-touch-icon'; appleLink.href = logoUrl;
    document.getElementsByTagName('head')[0].appendChild(appleLink);
    
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          const result = await getRedirectResult(auth);
          if (result?.user) setUser(result.user);
        }
      } catch (err) {
        setErrorMessage(`認證初始化失敗: ${err.message}`);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(query(wordsRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
      setWords(sorted);
      const masteredTotal = data.filter(w => w.stats?.mc?.archived).length;
      const badge = getBadgeInfo(masteredTotal);
      if (lastBadgedCount.current === -1) { lastBadgedCount.current = badge?.threshold || 0; return; }
      if (badge && badge.threshold > lastBadgedCount.current) { setShowBadge(badge); lastBadgedCount.current = badge.threshold; }
    });
    return () => unsubscribe();
  }, [user]);

  const filteredWords = words.filter(w => w.lang === langMode);
  const totalCount = filteredWords.length;
  const masteredCount = filteredWords.filter(w => w.stats?.mc?.archived).length;
  const progressPercent = totalCount > 0 ? (masteredCount / totalCount) * 100 : 0;

  // 處理單字輸入
  const checkAndTranslate = async (term) => {
    if (!term || term.length < 2 || isProcessing) return;
    setIsProcessing(true); setSpellCheck(null);
    try {
      if (langMode === 'EN') {
        const checkUrl = `https://api.datamuse.com/words?sp=${term}&max=1`;
        const res = await fetch(checkUrl);
        const data = await res.json();
        if (data.length > 0 && data[0].word.toLowerCase() !== term.toLowerCase()) setSpellCheck(data[0].word);
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
      setDuplicateAlert(true); setTimeout(() => setDuplicateAlert(false), 1500); return;
    }
    try {
      const userVocabRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
      await addDoc(userVocabRef, { term, definition: newWord.definition.trim(), lang: langMode, createdAt: Date.now(), stats: { mc: { correct: 0, total: 0, archived: false } } });
      setNewWord({ term: '', definition: '' }); setSearchTerm(''); setSpellCheck(null);
    } catch (e) { console.error("Add Error", e); }
  };

  const addSynonym = async (synonymText) => {
    const term = synonymText.split('(')[0].trim();
    const definition = synonymText.includes('(') ? synonymText.match(/\(([^)]+)\)/)[1] : "由同義詞快速加入";
    if (words.some(w => w.lang === langMode && w.term.toLowerCase() === term.toLowerCase())) { showToast(`「${term}」已經在獵場中了`, 'info'); return; }
    try {
      const userVocabRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
      await addDoc(userVocabRef, { term, definition, lang: langMode, createdAt: Date.now(), stats: { mc: { correct: 0, total: 0, archived: false } } });
      showToast(`已成功捕獲同義詞：${term}`);
    } catch (e) { showToast("捕獲失敗", "error"); }
  };

  const fetchExplanation = async (wordObj) => {
    if (isExplaining || !wordObj) return;
    setSelectedWord(wordObj);
    if (wordObj.analysis) { setExplanation(wordObj.analysis); return; }
    const cacheKey = `${wordObj.lang}:${wordObj.term.toLowerCase()}`;
    if (analysisCache.has(cacheKey)) { setExplanation(analysisCache.get(cacheKey)); return; }
    setExplanation(null); setIsExplaining(true);
    try {
      const prompt = `你是一個語言專家。分析單字 "${wordObj.term}" (${wordObj.lang === 'JP' ? '日文' : '英文'})。回傳格式必須為 JSON 物件，內容須為繁體中文：{"phonetic": "讀法", "pos": "詞性", "example_original": "例句原文", "example_zh": "例句翻譯", "synonyms": ["單字 (解釋)"], "tips": "技巧"}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
      const res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }) });
      const result = await res.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        const wordDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', wordObj.id);
        await updateDoc(wordDocRef, { analysis: parsed });
        analysisCache.set(cacheKey, parsed); setExplanation(parsed);
      }
    } catch (e) { showToast("AI 獵人暫時失手", "error"); } finally { setIsExplaining(false); }
  };

  const generateQuiz = () => {
    const pool = words.filter(w => w.lang === langMode && (!w.stats?.mc?.archived));
    if (pool.length < 3) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const others = pool.filter(w => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 2).map(w => w.definition);
    setQuizWord(target);
    const shuffledDistractors = [target.definition, ...others].sort(() => 0.5 - Math.random());
    setOptions([...shuffledDistractors, "我不確定"]);
    isTransitioning.current = false;
  };

  useEffect(() => { if (activeTab === 'quiz') generateQuiz(); }, [activeTab, langMode, words.length]);

  const handleQuizAnswer = async (ans) => {
    if (quizFeedback || !quizWord || isTransitioning.current || !user) return;
    isTransitioning.current = true;
    const isCorrect = ans === quizWord.definition;
    setQuizFeedback({ status: isCorrect ? 'correct' : 'wrong', message: isCorrect ? '🎯 完美擊中！' : `🍃 失手了！答案是：${quizWord.definition}` });
    if (isCorrect) {
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const newCorrect = stats.correct + 1;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(docRef, { "stats.mc": { total: stats.total + 1, correct: newCorrect, archived: newCorrect >= 3 } });
    }
    setTimeout(() => { setQuizFeedback(null); generateQuiz(); }, 1600);
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-[#2D4F1E] w-16 h-16" />
      <p className="mt-6 font-black text-[#2D4F1E] tracking-[0.2em] animate-pulse text-sm">正在進入獵場...</p>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="w-full max-w-sm bg-white p-10 rounded-[3.5rem] shadow-[0_20px_50px_rgba(45,79,30,0.1)] text-center z-10">
          <div className="w-24 h-24 bg-[#2D4F1E] rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl transform -rotate-3 overflow-hidden p-2">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain scale-110" />
          </div>
          <h1 className="text-3xl font-black text-stone-800 mb-2">VocabHunter</h1>
          <p className="text-stone-400 font-bold mb-10">捕捉單字，建立屬於你的智慧獵場</p>
          <div className="space-y-4">
            <button onClick={() => signInWithPopup(auth, provider)} className="w-full py-4 bg-white border-2 border-stone-100 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-all"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" /> Google 帳號登入</button>
            <button onClick={() => signInAnonymously(auth)} className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 shadow-lg">匿名獵人試玩</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FDFCF8] text-stone-800 pb-44 font-sans select-none overflow-x-hidden">
      {/* 🚀 Header 優化：縮小文字與間距，移除勳章 */}
      <header className="bg-white/80 backdrop-blur-2xl border-b border-stone-100 sticky top-0 z-40 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-[#2D4F1E] p-1 rounded-xl w-9 h-9 flex items-center justify-center overflow-hidden">
             <img src="/logo.png" alt="Logo" className="w-full h-full object-contain scale-125" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-base text-stone-800 tracking-tight">Vocab<span className="text-[#2D4F1E]">Hunter</span></span>
            <span className="text-[7px] font-black text-stone-300 tracking-[0.1em] uppercase">Smart Study</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 語言切換：手機版稍微縮小 */}
          <div className="bg-stone-100 p-1 rounded-xl flex border border-stone-200/50">
            {['EN', 'JP'].map(l => (
              <button key={l} onClick={() => setLangMode(l)} className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${langMode === l ? (l === 'EN' ? 'bg-[#2D4F1E]' : 'bg-[#C2410C]') + ' text-white' : 'text-stone-400'}`}>{l}</button>
            ))}
          </div>

          <div className="h-6 w-px bg-stone-100 mx-1"></div>

          <div className="flex items-center gap-1.5">
            {user.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-white shadow-sm" />
            ) : (
              <UserCircle size={28} className="text-stone-200" />
            )}
            {/* 🔴 關鍵修正：加上 shrink-0 確保登出鈕永遠顯示 */}
            <button onClick={() => signOut(auth)} className="text-stone-300 hover:text-red-500 p-1.5 shrink-0 transition-colors">
              <LogOut size={20}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 md:p-8">
        <div className="flex bg-stone-100/50 p-1.5 rounded-[2rem] mb-6 border border-stone-200/30">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'list' ? 'bg-white shadow-md text-[#2D4F1E]' : 'text-stone-400'}`}><BookOpen size={18}/> 我的獵場</button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-3.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'quiz' ? 'bg-white shadow-md text-[#2D4F1E]' : 'text-stone-400'}`}><Trophy size={18}/> 捕獲練習</button>
        </div>

        {activeTab === 'list' ? (
          <div className="flex flex-col gap-6 animate-in fade-in">
            <form onSubmit={addWord} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100 space-y-4">
              <div className="relative">
                <input type="text" placeholder={langMode === 'JP' ? "輸入日文..." : "輸入英文..."} className="w-full px-5 py-4 bg-stone-50 rounded-2xl focus:bg-white outline-none font-black text-xl transition-all" value={newWord.term} onChange={(e) => handleInputChange(e.target.value)} />
                <button type="button" onClick={() => checkAndTranslate(newWord.term)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2D4F1E] w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-stone-50">{isProcessing ? <Loader2 className="animate-spin w-4 h-4"/> : <Search size={20}/>}</button>
              </div>
              {spellCheck && <div className="text-xs font-bold text-amber-700 bg-amber-50 p-3 rounded-xl">您是指 <button type="button" onClick={() => { setNewWord(p => ({...p, term: spellCheck})); checkAndTranslate(spellCheck); }} className="underline font-black">{spellCheck}</button> 嗎？</div>}
              {searchTerm && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                  <input type="text" className="w-full px-5 py-4 bg-stone-50 rounded-2xl font-bold text-stone-600" value={newWord.definition} onChange={(e) => setNewWord({...newWord, definition: e.target.value})} />
                  <button type="submit" className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-[#2D4F1E]/10"><Plus size={20}/> 收錄單字</button>
                </div>
              )}
            </form>

            <div className="space-y-3">
              {words.filter(w => w.lang === langMode && w.term.toLowerCase().includes(searchTerm.toLowerCase())).map(word => (
                <div key={word.id} onClick={() => fetchExplanation(word)} className="group bg-white p-5 rounded-2xl border border-stone-50 shadow-sm flex justify-between items-center active:scale-[0.98]">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xl text-stone-800">{word.term}</span>
                      {word.stats?.mc?.archived && <Award size={14} className="text-orange-500 fill-orange-500"/>}
                    </div>
                    <div className="text-stone-400 font-bold text-sm truncate">{word.definition}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="p-2 text-stone-200 hover:text-[#2D4F1E]"><Volume2 size={22}/></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="p-2 text-stone-100 hover:text-red-400"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-stone-100 text-center min-h-[480px] flex flex-col justify-between relative overflow-hidden">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 animate-in zoom-in">
                  <div className={`p-8 rounded-full mb-4 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{quizFeedback.status === 'correct' ? <Target size={60} /> : <X size={60} />}</div>
                  <p className="font-black text-lg">{quizFeedback.message}</p>
                </div>
              )}
              {words.filter(w => w.lang === langMode && !w.stats?.mc?.archived).length < 3 ? (
                  <div className="my-auto space-y-6">
                    <AlertCircle size={48} className="mx-auto text-orange-200" />
                    <p className="text-stone-400 font-bold">請至少收錄 3 個未精通單字以啟動練習。</p>
                    <button onClick={() => setActiveTab('list')} className="px-6 py-3 bg-[#2D4F1E] text-white rounded-xl font-black">前往捕獲單字</button>
                  </div>
                ) : !quizWord ? <Loader2 className="animate-spin text-stone-100 mx-auto my-auto" size={40} /> : (
                <>
                  <div className="pt-6">
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="w-20 h-20 bg-[#2D4F1E] rounded-2xl text-white shadow-xl flex items-center justify-center mx-auto mb-6 active:scale-90"><Volume2 size={36}/></button>
                    <h2 className="text-4xl font-black text-stone-800 tracking-tight">{quizWord.term}</h2>
                  </div>
                  <div className="grid gap-3 pt-8">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(opt)} className={`py-4 px-6 rounded-2xl font-black text-base shadow-sm border-2 ${opt === "我不確定" ? "bg-stone-50 border-transparent text-stone-300" : "bg-white border-stone-50 text-stone-700 active:bg-[#2D4F1E] active:text-white"}`}>{opt}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 🏅 底部狀態欄：現在包含勳章與進度 */}
      <div className="fixed bottom-6 left-4 right-4 z-40">
        <div className="max-w-md mx-auto bg-white/80 backdrop-blur-2xl border border-white p-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center gap-4">
          <div className="relative shrink-0">
            {(() => {
              const masteredTotal = words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length;
              const badge = getBadgeInfo(masteredTotal);
              return badge ? (
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${badge.color} flex items-center justify-center text-white shadow-md`}>
                  {React.cloneElement(badge.icon, { size: 24 })}
                </div>
              ) : (
                <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center text-stone-200"><Trophy size={24} /></div>
              );
            })()}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                {getBadgeInfo(words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length)?.label || "見習獵人"}
              </span>
              <span className="font-black text-sm text-[#2D4F1E]">{masteredCount} / {totalCount}</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden border border-stone-50">
              <div className="h-full bg-[#2D4F1E] transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* 其他彈窗保持不變... */}
      {showBadge && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-stone-900/90 backdrop-blur-xl" onClick={() => setShowBadge(null)}></div>
          <Confetti />
          <div className={`relative w-full max-w-sm bg-gradient-to-br ${showBadge.color} p-1 rounded-[3.5rem] animate-in zoom-in duration-500`}>
            <div className="bg-white rounded-[3.3rem] p-10 text-center space-y-6">
              <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center bg-gradient-to-br ${showBadge.color} text-white shadow-xl`}>
                {React.cloneElement(showBadge.icon, { size: 40 })}
              </div>
              <div>
                <p className="text-stone-300 font-black text-[10px] uppercase tracking-widest mb-1">Achievement Unlocked</p>
                <h2 className="text-3xl font-black text-stone-800">{showBadge.label}</h2>
              </div>
              <button onClick={() => setShowBadge(null)} className={`w-full py-4 rounded-2xl bg-gradient-to-r ${showBadge.color} text-white font-black`}>收下榮耀</button>
            </div>
          </div>
        </div>
      )}

      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom-10">
            <div className={`${selectedWord.lang === 'JP' ? 'bg-[#C2410C]' : 'bg-[#2D4F1E]'} p-8 text-white`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                  <p className="text-white/80 font-bold mt-1">{selectedWord.definition}</p>
                </div>
                <button onClick={() => setSelectedWord(null)} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
              </div>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              {isExplaining ? <div className="py-12 text-center text-stone-300 font-black animate-pulse uppercase text-xs tracking-widest">AI Analyzing...</div> : explanation && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-stone-300 uppercase mb-1">詞性</p><p className="font-black text-stone-700">{explanation.pos}</p></div>
                    <div className="bg-stone-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-stone-300 uppercase mb-1">讀法</p><p className="font-black text-[#2D4F1E]">{explanation.phonetic}</p></div>
                  </div>
                  <div className="bg-stone-50 p-5 rounded-2xl border-l-4 border-[#2D4F1E]">
                    <p className="font-black text-stone-800 mb-2 italic">"{explanation.example_original}"</p>
                    <p className="text-stone-500 text-sm font-bold">{explanation.example_zh}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {explanation.synonyms?.map((s, i) => (
                      <button key={i} onClick={() => addSynonym(s)} className="px-4 py-2 bg-white border border-stone-100 rounded-xl text-xs font-black shadow-sm flex items-center gap-2 hover:border-[#2D4F1E]">+ {s}</button>
                    ))}
                  </div>
                  <div className="bg-orange-50 p-5 rounded-2xl text-orange-900 text-sm font-bold leading-relaxed">{explanation.tips}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4">
          <div className="px-5 py-2.5 bg-stone-800 text-white rounded-full shadow-xl flex items-center gap-2 font-black text-xs">
            <CheckCircle2 size={14}/> {toast.msg}
          </div>
        </div>
      )}
      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        body { overflow-x: hidden; touch-action: manipulation; }
      `}</style>
    </div>
  );
};

export default App;
