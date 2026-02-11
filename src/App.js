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
  AlertCircle,
  User as UserIcon,
  XCircle
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 與 環境配置修正 (解決 auth/invalid-api-key)
// ========================================================
const isCanvas = typeof __app_id !== 'undefined';

// 安全地獲取系統預置配置或回退到本地環境變數
let firebaseConfig = {};
if (isCanvas && typeof __firebase_config !== 'undefined') {
  // 在 Canvas 環境中，優先使用系統提供的配置
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  // 非 Canvas 環境，使用本地定義 (確保 process 不會報錯)
  const getEnv = (key, fallback) => {
    try {
      if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
      }
    } catch (e) {}
    return fallback;
  };

  firebaseConfig = {
    apiKey: getEnv('REACT_APP_FIREBASE_API_KEY', ""), 
    authDomain: getEnv('REACT_APP_FIREBASE_AUTH_DOMAIN', "vocabularyh-4c909.firebaseapp.com"),
    projectId: getEnv('REACT_APP_FIREBASE_PROJECT_ID', "vocabularyh-4c909"),
    storageBucket: getEnv('REACT_APP_FIREBASE_STORAGE_BUCKET', "vocabularyh-4c909.firebasestorage.app"),
    messagingSenderId: getEnv('REACT_APP_FIREBASE_MESSAGING_SENDER_ID', "924954723346"),
    appId: getEnv('REACT_APP_FIREBASE_APP_ID', "1:924954723346:web:cc792c2fdd317fb96684cb"),
  };
}

// Gemini API Key 處理：在 Canvas 環境下保持為空，本地環境下則讀取環境變數
const geminiApiKey = isCanvas ? "" : (process?.env?.REACT_APP_GEMINI_KEY || "");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const appId = isCanvas ? __app_id : 'multilang-vocab-master';

// ========================================================
// 🛡️ API 輔助函式：實作 Exponential Backoff
// ========================================================
const fetchWithRetry = async (url, options, maxRetries = 5) => {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
      continue;
    }
    return response;
  }
  return fetch(url, options);
};

const App = () => {
  const [user, setUser] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const isTransitioning = useRef(false);

  const currentLangWords = words.filter(w => w.lang === langMode);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 資料監聽：遵循 RULE 3，確保 user 存在後才發起請求
  useEffect(() => {
    if (!user) return;
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(wordsRef, 
      (snapshot) => {
        const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWords(wordList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      },
      (err) => setErrorMsg("資料庫連線異常")
    );
    return () => unsubscribe();
  }, [user]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg("Google 登入失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setErrorMsg("匿名登入失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setWords([]);
      setSelectedWord(null);
    } catch (err) {
      setErrorMsg("登出失敗");
    }
  };

  const speak = (text, lang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const fetchTranslation = async () => {
    if (!newWord.term || isProcessing) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const prompt = `Translate this ${langMode === 'EN' ? 'English' : 'Japanese'} word to Traditional Chinese: "${newWord.term}". Just provide the most common one-word meaning. No extra text.`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!response.ok) throw new Error("翻譯助手目前無法回應");

      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setNewWord(prev => ({ ...prev, definition: result?.trim() || "" }));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    setExplanation(null);
    setIsExplaining(true);
    setErrorMsg(null);
    try {
      const prompt = `Analyze: "${word.term}" (${word.lang}). Respond in Traditional Chinese JSON:
      {
        "phonetic": "pronunciation",
        "pos": "part of speech",
        "example_original": "example sentence",
        "example_zh": "chinese translation",
        "synonyms": ["Word1 (中文1)", "Word2 (中文2)"],
        "tips": "memory tip"
      }`;
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error("解析失敗");

      const data = await response.json();
      const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
      setExplanation(parsed);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsExplaining(false);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;

    const isDuplicate = currentLangWords.some(
      w => w.term.toLowerCase().trim() === newWord.term.toLowerCase().trim()
    );

    if (isDuplicate) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 3000);
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'vocab'), {
        term: newWord.term.trim(),
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
    } catch (err) {
      setErrorMsg("新增單字失敗");
    }
  };

  const handleQuizAnswer = async (answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    
    isTransitioning.current = true;
    const isCorrect = answer === quizWord.definition;
    const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
    const newTotal = stats.total + 1;
    const newCorrect = isCorrect ? stats.correct + 1 : stats.correct;
    const shouldArchive = newCorrect >= 3 && (newCorrect / newTotal) >= 0.7;

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      message: isCorrect ? (shouldArchive ? '🎯 完美擊殺！獵物已收錄' : '✨ 命中！繼續保持') : `❌ 遺漏了！正確是：${quizWord.definition}` 
    });

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id), { 
        stats: { mc: { total: newTotal, correct: newCorrect, archived: shouldArchive } } 
      });
    } catch (e) {}
    
    setTimeout(() => {
        setQuizFeedback(null);
        if (activeTab === 'quiz') generateQuiz();
    }, 1500);
  };

  const generateQuiz = (currentWords = words) => {
    const allCurrentLang = currentWords.filter(w => w.lang === langMode);
    const eligibleWords = allCurrentLang.filter(w => !w.stats?.mc?.archived);
    
    if (allCurrentLang.length < 3 || eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }

    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherOptions = allCurrentLang
      .filter(w => w.id !== randomWord.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(w => w.definition);
    
    setQuizWord(randomWord);
    setOptions([...otherOptions, randomWord.definition].sort(() => 0.5 - Math.random()));
    isTransitioning.current = false;
  };

  useEffect(() => { 
    if (activeTab === 'quiz' && !quizFeedback) generateQuiz(); 
  }, [activeTab, langMode, words]);

  const archivedCount = currentLangWords.filter(w => w.stats?.mc?.archived).length;
  const progress = currentLangWords.length > 0 ? (archivedCount / currentLangWords.length) * 100 : 0;

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#FDFCF8]">
      <div className="text-center">
        <Loader2 className="animate-spin text-[#2D4F1E] w-10 h-10 mx-auto mb-4" />
        <p className="font-black text-[#2D4F1E] tracking-tighter">加載獵區中...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-[#FDFCF8] p-6">
      <div className="max-w-sm w-full bg-white p-8 rounded-[2.5rem] shadow-xl border border-stone-100 text-center">
        <div className="w-16 h-16 bg-[#2D4F1E] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#2D4F1E]/20">
          <Compass className="text-white w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-stone-800 mb-2">VocabHunter</h1>
        <p className="text-stone-400 text-sm font-medium mb-8">同步你的單字獵場，跨裝置狩獵</p>
        
        <div className="space-y-3">
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white border border-stone-200 text-stone-700 rounded-2xl font-black flex items-center justify-center gap-3 shadow-sm active:scale-95 transition-all">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            使用 Google 登入
          </button>
          <button onClick={handleAnonymousLogin} className="w-full py-4 bg-stone-50 text-stone-500 rounded-2xl font-bold text-sm active:scale-95 transition-all">
            直接進入 (訪客模式)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-stone-800 pb-28 font-sans overflow-x-hidden">
      <header className="bg-white/80 backdrop-blur-lg border-b sticky top-0 z-40 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-[#2D4F1E] rounded-lg shadow-lg">
            <Compass className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-black text-[#2D4F1E] hidden sm:inline">VocabHunter</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-stone-100 p-1 rounded-lg flex border text-[10px] font-black mr-2">
            <button onClick={() => setLangMode('EN')} className={`px-3 py-1 rounded-md transition-all ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-3 py-1 rounded-md transition-all ${langMode === 'JP' ? 'bg-[#C2410C] text-white' : 'text-stone-400'}`}>JP</button>
          </div>
          
          <div className="flex items-center gap-2 pl-2 border-l border-stone-100">
            <div className="flex items-center gap-1.5 bg-stone-100 px-2 py-1 rounded-full border border-stone-200">
              {user.isAnonymous ? (
                <div className="w-7 h-7 rounded-full bg-stone-300 flex items-center justify-center text-stone-600"><UserIcon size={14} /></div>
              ) : (
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2D4F1E&color=fff`} className="w-7 h-7 rounded-full border border-stone-200" alt="U" />
              )}
              <span className="text-[10px] font-black text-stone-500 pr-1 uppercase">{user.isAnonymous ? 'Guest' : (user.displayName || 'User')}</span>
            </div>
            <button onClick={handleSignOut} className="p-2 text-stone-400 hover:text-red-500 active:scale-90 transition-all rounded-full hover:bg-red-50">
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-stone-800 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-stone-700">
            <AlertCircle size={20} className="text-orange-400" />
            <span className="font-black text-sm">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-2 text-stone-400"><X size={14}/></button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex bg-stone-200/50 p-1 rounded-xl mb-6 shadow-inner">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <BookOpen size={16} /> 單字庫
          </button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <Trophy size={16} /> 挑戰
          </button>
        </div>

        {activeTab === 'list' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 h-fit">
              <form onSubmit={addWord} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="單字..." 
                      className={`w-full px-4 py-3 bg-stone-50 border-2 rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm transition-all ${duplicateAlert ? 'border-red-500 animate-shake' : 'border-transparent'}`} 
                      value={newWord.term} 
                      onChange={(e) => {
                        setNewWord({ ...newWord, term: e.target.value });
                        if (duplicateAlert) setDuplicateAlert(false);
                      }} 
                    />
                    <button type="button" onClick={fetchTranslation} className="absolute right-3 top-3 text-[#2D4F1E]">
                      {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="翻譯..." 
                    className="w-full flex-1 px-4 py-3 bg-stone-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm transition-all" 
                    value={newWord.definition} 
                    onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} 
                  />
                </div>
                <button type="submit" disabled={!newWord.term || !newWord.definition} className="w-full py-3 rounded-xl font-black text-white bg-[#2D4F1E] flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-30">
                  <Plus size={18} /> 收錄單字
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {currentLangWords.map(word => (
                <div 
                  key={word.id} 
                  onClick={() => fetchExplanation(word)}
                  className={`bg-white p-4 rounded-xl border-2 transition-all active:scale-[0.98] flex justify-between items-center ${selectedWord?.id === word.id ? 'border-[#2D4F1E] bg-[#2D4F1E]/5' : 'border-stone-100'}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black">{word.term}</span>
                      {word.stats?.mc?.archived && <Sparkles size={12} className="text-orange-500" />}
                    </div>
                    <p className="text-stone-400 text-sm font-medium">{word.definition}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="p-3 text-stone-300 hover:text-[#2D4F1E] active:scale-90 transition-all"><Volume2 size={20}/></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="p-3 text-stone-200 hover:text-red-500 active:scale-90 transition-all"><Trash2 size={20}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto py-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-stone-100 text-center min-h-[440px] flex flex-col justify-center relative">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 bg-white/95 backdrop-blur-md animate-in fade-in zoom-in duration-300">
                  <div className={`p-6 rounded-full mb-6 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-700'}`}>
                    {quizFeedback.status === 'correct' ? <Target size={80} className="animate-bounce" /> : <XCircle size={80} />}
                  </div>
                  <h2 className={`text-3xl font-black mb-3 ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-red-700'}`}>{quizFeedback.status === 'correct' ? 'Bingo!' : 'Oops!'}</h2>
                  <p className={`text-base font-black px-6 py-3 rounded-2xl shadow-sm ${quizFeedback.status === 'correct' ? 'bg-green-500 text-white' : 'bg-stone-100 text-stone-600'}`}>{quizFeedback.message}</p>
                </div>
              )}
              {!quizWord ? (
                <div className="text-stone-300 font-black">獵物不足，請先去單字庫捕捉獵物！</div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <span className="bg-stone-100 px-3 py-1 rounded-full text-[10px] font-black text-stone-400 uppercase tracking-widest">Quiz Session</span>
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-3 bg-stone-50 rounded-full border border-stone-100"><Volume2 size={24} className="text-[#2D4F1E]"/></button>
                  </div>
                  <h2 className="text-4xl font-black mb-10 text-stone-800">{quizWord.term}</h2>
                  <div className="grid gap-3">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(opt)} disabled={!!quizFeedback} className="py-4 px-6 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold text-sm text-stone-700 active:bg-[#2D4F1E] active:text-white transition-all">
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300">
            <div className="bg-[#2D4F1E] p-6 text-white">
              <div className="flex justify-between">
                <div>
                  <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                  <p className="text-white/80 font-bold">{selectedWord.definition}</p>
                </div>
                <button onClick={() => setSelectedWord(null)} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {isExplaining ? (
                <div className="flex items-center gap-3 text-stone-400 font-bold animate-pulse"><Loader2 size={18} className="animate-spin" /> AI 解析中...</div>
              ) : explanation ? (
                <>
                  <section>
                    <h4 className="text-[10px] font-black text-stone-300 uppercase mb-2">實戰例句</h4>
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                      <p className="font-bold text-[#2D4F1E] mb-1 italic">"{explanation.example_original}"</p>
                      <p className="text-stone-400 text-xs">{explanation.example_zh}</p>
                    </div>
                  </section>
                  <section>
                    <h4 className="text-[10px] font-black text-stone-300 uppercase mb-2">記憶點</h4>
                    <p className="text-xs font-bold text-orange-900 leading-relaxed bg-orange-50 p-3 rounded-lg border border-orange-100">{explanation.tips}</p>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 z-40">
        <div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-xl border border-stone-100 p-3 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="flex flex-col items-center min-w-[50px]">
            <span className="text-[8px] font-black text-stone-300 uppercase">PROGRESS</span>
            <span className="text-sm font-black text-[#2D4F1E]">{archivedCount}/{currentLangWords.length}</span>
          </div>
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D4F1E] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-lg font-black text-[#2D4F1E]">{Math.round(progress)}%</span>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default App;
