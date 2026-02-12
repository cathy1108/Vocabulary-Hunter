import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  addDoc, 
  deleteDoc 
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
  UserCircle
} from 'lucide-react';

// ========================================================
// 🛠️ 基礎配置與環境變數處理
// ========================================================
const isCanvas = typeof __app_id !== 'undefined';
const analysisCache = new Map();

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "",
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
const appId = isCanvas ? __app_id : 'mobile-vocab-hunter';

// ========================================================
// 🧠 輔助函式
// ========================================================
const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const fetchWithRetry = async (url, options, maxRetries = 5) => {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, delay));
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  // 拼寫建議狀態
  const [spellCheck, setSpellCheck] = useState(null);
  const typingTimer = useRef(null);

  // 測驗狀態
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const isTransitioning = useRef(false);

  const speak = (text, lang) => {
    if (!text || typeof text !== 'string') return;
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const ut = new SpeechSynthesisUtterance(text);
      ut.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
      ut.rate = 0.9;
      window.speechSynthesis.speak(ut);
    }, 50);
  };

  // ========================================================
  // 🔐 認證邏輯 (回歸並優化)
  // ========================================================
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (isCanvas && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
        // 如果是在一般環境且沒有 token，我們讓用戶點擊按鈕登入，不預設自動匿名登入
      } catch (err) {
        console.error("Auth Init Error", err);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google Login Error", err);
    }
  };

  const handleAnonymousLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error("Anonymous Login Error", err);
    }
  };

  // ========================================================
  // 📊 資料同步
  // ========================================================
  useEffect(() => {
    // 守衛：如果 user 還沒載入，不進行任何 Firestore 請求
    if (!user) return;
    
    // 修正路徑結構為 /artifacts/{appId}/users/{userId}/{collectionName}
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    
    const unsubscribe = onSnapshot(query(wordsRef), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWords(data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
      }, 
      (error) => {
        // 捕捉權限錯誤，避免 console 出現大量紅字
        console.warn("Firestore Connection Status:", error.message);
      }
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
        const checkRes = await fetch(checkUrl);
        const checkData = await checkRes.json();
        if (checkData.length > 0 && checkData[0].word.toLowerCase() !== term.toLowerCase()) {
          setSpellCheck(checkData[0].word);
        }
      }

      const sourceLang = langMode === 'JP' ? 'ja' : 'en';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=zh-TW&dt=t&q=${encodeURIComponent(term)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.[0]?.[0]) {
        setNewWord(prev => ({ ...prev, definition: String(data[0][0][0]) }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (val) => {
    setNewWord(prev => ({ ...prev, term: val }));
    setSearchTerm(val);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      checkAndTranslate(val);
    }, 800);
  };

  const handleCorrectSpelling = (correctedWord) => {
    setNewWord(prev => ({ ...prev, term: correctedWord }));
    setSearchTerm(correctedWord);
    setSpellCheck(null);
    checkAndTranslate(correctedWord);
  };

  const filteredWords = words.filter(w => {
    if (w.lang !== langMode) return false;
    return w.term.toLowerCase().includes(searchTerm.toLowerCase());
  });

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
      // 修正：寫入時的路徑必須完全符合讀取時的路徑
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
    } catch (e) {
      console.error("Add Word Error", e);
    }
  };

  // ========================================================
  // 🤖 AI 分析詳解
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
      const languageContext = word.lang === 'JP' ? '日文 (Japanese)' : '英文 (English)';
      const prompt = `你是一個語言專家。分析單字 "${word.term}" (${languageContext})。
      回傳格式必須為 JSON 物件，內容須為繁體中文：
      {
        "phonetic": "讀法(日文給平假名, 英文給音標)",
        "pos": "詞性",
        "example_original": "單句例句(原文)",
        "example_zh": "例句翻譯(繁體中文)",
        "synonyms": ["該語言單字1 (解釋1)", "該語言單字2 (解釋2)"],
        "tips": "記憶技巧"
      }`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      });
      const result = await response.json();
      const parsed = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
      analysisCache.set(cacheKey, parsed);
      setExplanation(parsed);
    } catch (e) {
      console.error("AI Error", e);
    } finally {
      setIsExplaining(false);
    }
  };

  // ========================================================
  // 🏁 測驗邏輯
  // ========================================================
  const generateQuiz = () => {
    const fullPool = words.filter(w => w.lang === langMode);
    if (fullPool.length < 3) return;
    const target = fullPool[Math.floor(Math.random() * fullPool.length)];
    const others = fullPool.filter(w => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.definition);
    setQuizWord(target);
    setOptions([...others, target.definition].sort(() => 0.5 - Math.random()));
    isTransitioning.current = false;
  };

  useEffect(() => { if (activeTab === 'quiz') generateQuiz(); }, [activeTab, langMode, words.length]);

  const handleQuizAnswer = async (ans) => {
    if (quizFeedback || !quizWord || isTransitioning.current) return;
    isTransitioning.current = true;
    const isCorrect = ans === quizWord.definition;
    setQuizFeedback({ status: isCorrect ? 'correct' : 'wrong', message: isCorrect ? '✨ 擊中標靶！' : `❌ 答案是：${quizWord.definition}` });
    
    if (isCorrect) {
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const newCorrect = stats.correct + 1;
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id), { 
        "stats.mc": { total: stats.total + 1, correct: newCorrect, archived: newCorrect >= 3 } 
      });
    }
    setTimeout(() => { setQuizFeedback(null); generateQuiz(); }, 1500);
  };

  const progress = words.filter(w => w.lang === langMode).length > 0 
    ? (words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length / words.filter(w => w.lang === langMode).length) * 100 
    : 0;

  // ========================================================
  // 🎨 渲染 UI
  // ========================================================
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#2D4F1E] w-12 h-12" />
        <p className="mt-4 font-black text-stone-400 tracking-widest">進入獵場中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[3rem] shadow-2xl text-center border-2 border-stone-100 animate-in fade-in zoom-in">
          <div className="w-20 h-20 bg-[#2D4F1E] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3 transition-transform hover:rotate-0">
            <Compass className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-stone-800 mb-2">VocabHunter</h1>
          <p className="text-stone-400 font-bold mb-8">收服屬於你的智慧單字獵場</p>
          <div className="space-y-4">
            <button 
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white border-2 border-stone-100 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-stone-50 transition-all shadow-sm active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
              使用 Google 登入
            </button>
            <button 
              onClick={handleAnonymousLogin}
              className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-lg active:scale-95"
            >
              <UserCircle size={20} />
              匿名獵人試玩
            </button>
          </div>
          <p className="mt-8 text-[10px] text-stone-300 font-bold uppercase tracking-widest">Powered by Google Gemini & Firebase</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FDFCF8] text-stone-800 pb-32 font-sans select-none">
      <header className="bg-white/90 backdrop-blur-xl border-b sticky top-0 z-40 px-5 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 font-black text-[#2D4F1E] text-lg"><Compass size={24}/> VocabHunter</div>
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 p-1 rounded-xl flex border border-stone-200">
            {['EN', 'JP'].map(l => (
              <button key={l} onClick={() => setLangMode(l)} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === l ? (l === 'EN' ? 'bg-[#2D4F1E]' : 'bg-[#C2410C]') + ' text-white shadow-md' : 'text-stone-400'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => signOut(auth)} className="text-stone-300 hover:text-red-500 p-1 transition-colors"><LogOut size={22}/></button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 md:p-6">
        <div className="flex bg-stone-100 p-1.5 rounded-[1.5rem] mb-6 shadow-inner">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'list' ? 'bg-white shadow-lg text-[#2D4F1E]' : 'text-stone-400'}`}><BookOpen size={20}/> 獵場清單</button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'quiz' ? 'bg-white shadow-lg text-[#2D4F1E]' : 'text-stone-400'}`}><Trophy size={20}/> 挑戰模式</button>
        </div>

        {activeTab === 'list' ? (
          <div className="flex flex-col gap-6">
            <form onSubmit={addWord} className={`bg-white p-6 rounded-[2rem] border-2 shadow-xl space-y-4 transition-all ${duplicateAlert ? 'animate-shake border-red-300' : 'border-transparent'}`}>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder={langMode === 'JP' ? "輸入日文單字..." : "輸入英文單字..."} 
                  className="w-full px-5 py-4 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-[#2D4F1E] outline-none font-black text-xl" 
                  value={newWord.term} 
                  onChange={(e) => handleInputChange(e.target.value)} 
                />
                <button type="button" onClick={() => checkAndTranslate(newWord.term)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2D4F1E] w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-stone-100">
                  {isProcessing ? <Loader2 className="animate-spin w-4 h-4"/> : <Search size={20}/>}
                </button>
              </div>

              {spellCheck && (
                <div className="flex items-center gap-3 text-amber-600 bg-amber-50 px-4 py-3 rounded-2xl border border-amber-100 animate-in slide-in-from-top-1">
                  <AlertCircle size={18} className="shrink-0"/>
                  <div className="text-sm font-bold">
                    您是指 
                    <button 
                      type="button"
                      onClick={() => handleCorrectSpelling(spellCheck)}
                      className="mx-1 px-2 py-0.5 bg-amber-200/50 hover:bg-amber-200 rounded-lg text-amber-800 underline decoration-2 underline-offset-2 transition-all"
                    >
                      {spellCheck}
                    </button> 
                    嗎？
                  </div>
                </div>
              )}
              
              {searchTerm && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <input type="text" placeholder="確認中文翻譯..." className="w-full px-5 py-4 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-[#2D4F1E] outline-none font-bold text-stone-600 text-lg mb-3" value={newWord.definition} onChange={(e) => setNewWord({...newWord, definition: e.target.value})} />
                  <button type="submit" className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <Plus size={22}/> 收錄獵物
                  </button>
                </div>
              )}
            </form>

            <div className="space-y-3">
              {filteredWords.map(word => (
                <div key={word.id} onClick={() => fetchExplanation(word)} className="bg-white p-5 rounded-[1.5rem] border-2 border-white shadow-sm flex justify-between items-center active:bg-stone-50 transition-all cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-black text-xl text-stone-800">
                      {word.term} {word.stats?.mc?.archived && <Sparkles size={16} className="text-orange-500 fill-orange-500 animate-pulse"/>}
                    </div>
                    <div className="text-stone-400 font-bold mt-1 line-clamp-1">{word.definition}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-[#2D4F1E] transition-all"><Volume2 size={22}/></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="w-10 h-10 flex items-center justify-center text-stone-200 hover:text-red-500 transition-all"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-2 border-stone-100 text-center min-h-[480px] flex flex-col justify-between relative overflow-hidden">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 animate-in fade-in zoom-in">
                  <div className={`p-8 rounded-full mb-6 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {quizFeedback.status === 'correct' ? <Target size={80} className="animate-bounce" /> : <X size={80} />}
                  </div>
                  <h2 className="text-2xl font-black mb-3">{quizFeedback.status === 'correct' ? '擊中標靶！' : '錯過了！'}</h2>
                  <p className="font-black text-stone-500">{quizFeedback.message}</p>
                </div>
              )}
              {words.filter(w => w.lang === langMode).length < 3 ? (
                <div className="my-auto text-stone-300 font-bold p-10 text-center">需要 3 個單字啟動獵場測驗</div>
              ) : !quizWord ? (
                <div className="my-auto animate-pulse font-black text-stone-300">搜尋獵物中...</div>
              ) : (
                <>
                  <div className="mb-8 pt-4">
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="w-20 h-20 bg-[#2D4F1E] rounded-full text-white shadow-xl flex items-center justify-center mx-auto mb-6 active:scale-90 transition-all">
                      <Volume2 size={40} />
                    </button>
                    <h2 className="text-4xl font-black text-stone-800">{quizWord.term}</h2>
                  </div>
                  <div className="grid gap-3">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(opt)} className="py-4 px-6 bg-stone-50 border-2 border-stone-100 rounded-2xl font-black text-stone-700 active:bg-[#2D4F1E] active:text-white transition-all shadow-sm">{opt}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 單字詳情彈窗 */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[3rem] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom-10">
            <div className="bg-[#2D4F1E] px-8 pt-10 pb-8 text-white">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                    <button onClick={() => speak(selectedWord.term, selectedWord.lang)} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all"><Volume2 size={20}/></button>
                  </div>
                  <p className="text-white/70 font-bold text-lg mt-1">{selectedWord.definition}</p>
                </div>
                <button onClick={() => setSelectedWord(null)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={20}/></button>
              </div>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              {isExplaining ? (
                <div className="py-20 text-center font-black text-stone-300 animate-pulse">
                  <Sparkles className="mx-auto mb-4 animate-spin text-stone-200" size={48} />
                  AI 獵人分析中...
                </div>
              ) : explanation && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">詞性</p>
                      <p className="font-black text-stone-600">{explanation.pos}</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">讀法/音標</p>
                      <p className="font-black text-[#2D4F1E] font-mono">{explanation.phonetic}</p>
                    </div>
                  </div>
                  <section>
                    <div className="flex items-center justify-between font-black text-stone-400 text-xs mb-3 uppercase tracking-widest">
                      <span className="flex items-center gap-2"><PlayCircle size={16}/> 實戰例句</span>
                      <button onClick={() => speak(explanation.example_original, selectedWord.lang)} className="flex items-center gap-1 text-[#2D4F1E] bg-stone-50 px-3 py-1.5 rounded-lg active:scale-95 transition-all">
                        <Volume2 size={14}/> 播放
                      </button>
                    </div>
                    <div className="bg-stone-50 p-5 rounded-2xl border-l-4 border-[#2D4F1E]">
                      <p className="font-black text-stone-800 mb-2 leading-relaxed text-lg italic">"{explanation.example_original}"</p>
                      <p className="text-stone-500 font-bold text-sm">{explanation.example_zh}</p>
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center gap-2 font-black text-stone-400 text-xs mb-3 uppercase tracking-widest"><Layers size={16}/> 同義詞參考</div>
                    <div className="flex flex-wrap gap-2">
                      {explanation.synonyms?.map((s, i) => (
                        <span key={i} className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl text-xs font-black">{s}</span>
                      ))}
                    </div>
                  </section>
                  <section className="bg-amber-50 p-5 rounded-[1.5rem] border border-amber-100">
                    <div className="flex items-center gap-2 font-black text-amber-600 text-xs mb-2 uppercase tracking-widest"><Sparkles size={16}/> 獵人提示</div>
                    <p className="text-amber-900 font-bold text-sm leading-relaxed">{explanation.tips}</p>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 底部進度條 */}
      <div className="fixed bottom-4 left-4 right-4 z-40">
        <div className="max-w-md mx-auto bg-white/90 backdrop-blur-xl border-2 border-stone-100 p-4 rounded-[2rem] shadow-2xl flex items-center gap-4">
          <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D4F1E] transition-all duration-700" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="font-black text-xs text-[#2D4F1E]">{Math.round(progress)}%</div>
        </div>
      </div>

      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
};

export default App;
