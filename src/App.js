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
  AlertCircle,
  XCircle,
  Layers
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 配置與環境判定
// ========================================================
const isCanvas = typeof __firebase_config !== 'undefined';

const firebaseConfig = isCanvas
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

// 使用 Gemini 1.5 Flash
const GEMINI_MODEL = "gemini-1.5-flash"; 
const apiCache = new Map();

// ========================================================
// 🛡️ API 輔助函式 (修復 404 與解析錯誤)
// ========================================================
const fetchGemini = async (prompt, isJson = false) => {
  const cacheKey = `${isJson ? 'json:' : 'text:'}${prompt}`;
  if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

  // 在正式環境中使用環境變數，Canvas 環境則由系統處理 Key
  const geminiApiKey = isCanvas ? "" : (process.env.REACT_APP_GEMINI_KEY || "");
  
  // 修正 URL: 確保路徑與型號名稱正確
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  if (isJson) {
    payload.generationConfig = { 
      responseMimeType: "application/json",
      temperature: 0.1 
    };
  }

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        throw new Error("API 型號路徑不存在 (404)，請檢查模型名稱或 API 版本");
      }

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      let result = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!result) throw new Error("無效的 API 回應內容");

      if (isJson) {
        // 清理 Markdown 標籤以防萬一
        result = result.replace(/```json/g, "").replace(/```/g, "").trim();
      }

      apiCache.set(cacheKey, result);
      return result;
    } catch (e) {
      if (i === 4) throw e;
      if (e.message.includes("404")) throw e; // 404 不重試
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
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

  // 初始化 Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 監聽單字庫
  useEffect(() => {
    if (!user) return;
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(wordsRef, (snapshot) => {
      const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWords(wordList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (err) => setErrorMsg("資料庫連線失敗"));
    return () => unsubscribe();
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      setErrorMsg(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setErrorMsg("登入視窗被瀏覽器阻擋了，請允許彈出視窗");
      } else if (err.code === 'auth/unauthorized-domain') {
        setErrorMsg("此網域尚未在 Firebase Console 加入授權名單");
      } else {
        setErrorMsg("登入失敗，請稍後再試");
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setWords([]);
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
    try {
      const prompt = `Translate this ${langMode === 'EN' ? 'English' : 'Japanese'} word to Traditional Chinese: "${newWord.term}". Just provide the most common one-word meaning. No extra text.`;
      const result = await fetchGemini(prompt);
      setNewWord(prev => ({ ...prev, definition: result?.trim() || "" }));
    } catch (err) {
      setErrorMsg("翻譯失敗");
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    setExplanation(null);
    setIsExplaining(true);
    try {
      const prompt = `Task: Analyze the word "${word.term}" (${word.lang}).
      Output must be strictly valid JSON in Traditional Chinese:
      {
        "phonetic": "pronunciation symbols",
        "pos": "part of speech (e.g. 名詞, 動詞)",
        "example_original": "one high-quality example sentence",
        "example_zh": "chinese translation of example",
        "synonyms": ["Synonym1 (中文解釋)", "Synonym2 (中文解釋)"],
        "tips": "mnemonic tip or usage note"
      }`;
      const result = await fetchGemini(prompt, true);
      const parsed = JSON.parse(result);
      setExplanation(parsed);
    } catch (err) {
      console.error("Parse Error:", err);
      setErrorMsg("AI 解析格式錯誤，請再試一次");
    } finally {
      setIsExplaining(false);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    if (currentLangWords.some(w => w.term.toLowerCase() === newWord.term.toLowerCase())) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 2000);
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
    } catch (err) { setErrorMsg("新增單字失敗"); }
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
      message: isCorrect ? (shouldArchive ? '🎯 已精通！移出題庫' : '✨ 答對了！') : `❌ 正確是：${quizWord.definition}` 
    });

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id), { 
        "stats.mc": { total: newTotal, correct: newCorrect, archived: shouldArchive } 
      });
    } catch (e) {}
    
    setTimeout(() => {
        setQuizFeedback(null);
        if (activeTab === 'quiz') generateQuiz();
    }, 1500);
  };

  const generateQuiz = () => {
    const eligibleWords = currentLangWords.filter(w => !w.stats?.mc?.archived);
    if (currentLangWords.length < 3 || eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }
    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherOptions = currentLangWords
      .filter(w => w.id !== randomWord.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(w => w.definition);
    setQuizWord(randomWord);
    setOptions([...otherOptions, randomWord.definition].sort(() => 0.5 - Math.random()));
    isTransitioning.current = false;
  };

  useEffect(() => { if (activeTab === 'quiz' && !quizFeedback) generateQuiz(); }, [activeTab, langMode, words.length]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#FDFCF8]"><Loader2 className="animate-spin text-[#2D4F1E]" /></div>;

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-[#FDFCF8] p-6">
      <div className="max-w-sm w-full bg-white p-8 rounded-[2.5rem] shadow-xl text-center border">
        <Compass className="text-[#2D4F1E] w-12 h-12 mx-auto mb-6" />
        <h1 className="text-2xl font-black mb-2">VocabHunter</h1>
        <p className="text-stone-400 text-sm mb-8">獵取、記錄、精通每個新單字</p>
        <div className="space-y-3">
          {!isCanvas && (
            <button onClick={handleGoogleLogin} className="w-full py-4 bg-white border border-stone-200 text-stone-700 rounded-2xl font-black flex items-center justify-center gap-3">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              使用 Google 登入
            </button>
          )}
          <button onClick={() => signInAnonymously(auth)} className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black shadow-lg">
            訪客模式進入
          </button>
          {isCanvas && <p className="text-[10px] text-stone-400 mt-4">預覽模式限制 Google 登入，請使用訪客模式</p>}
        </div>
      </div>
    </div>
  );

  const archivedCount = currentLangWords.filter(w => w.stats?.mc?.archived).length;
  const progress = currentLangWords.length > 0 ? (archivedCount / currentLangWords.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-stone-800 pb-28 font-sans">
      <header className="bg-white/80 backdrop-blur-lg border-b sticky top-0 z-40 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-[#2D4F1E] rounded-lg text-white font-black">V</div>
          <span className="text-xl font-black text-[#2D4F1E]">VocabHunter</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 p-1 rounded-lg flex border text-[10px] font-black">
            <button onClick={() => setLangMode('EN')} className={`px-3 py-1 rounded-md ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-3 py-1 rounded-md ${langMode === 'JP' ? 'bg-[#C2410C] text-white' : 'text-stone-400'}`}>JP</button>
          </div>
          <button onClick={handleSignOut} className="p-2 text-stone-400 hover:text-red-500 transition-all"><LogOut size={18}/></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex bg-stone-200/50 p-1 rounded-xl mb-6 shadow-inner">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-2.5 rounded-lg font-black text-xs flex items-center justify-center gap-2 ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <BookOpen size={16} /> 我的單字
          </button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-2.5 rounded-lg font-black text-xs flex items-center justify-center gap-2 ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <Trophy size={16} /> 獵場挑戰
          </button>
        </div>

        {activeTab === 'list' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 h-fit">
              <form onSubmit={addWord} className="space-y-3">
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="輸入單字..." 
                    className={`w-full px-4 py-3 bg-stone-50 border-2 rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm ${duplicateAlert ? 'border-red-500' : 'border-transparent'}`} 
                    value={newWord.term} 
                    onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} 
                  />
                  <button type="button" onClick={fetchTranslation} className="absolute right-3 top-3 text-[#2D4F1E]">
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  </button>
                </div>
                <input 
                  type="text" 
                  placeholder="翻譯或註解..." 
                  className="w-full px-4 py-3 bg-stone-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm" 
                  value={newWord.definition} 
                  onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} 
                />
                <button type="submit" disabled={!newWord.term || !newWord.definition} className="w-full py-3 rounded-xl font-black text-white bg-[#2D4F1E] flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-30">
                  <Plus size={18} /> 加入清單
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {currentLangWords.map(word => (
                <div 
                  key={word.id} 
                  onClick={() => fetchExplanation(word)}
                  className={`bg-white p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedWord?.id === word.id ? 'border-[#2D4F1E] bg-[#2D4F1E]/5' : 'border-stone-100'}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black">{word.term}</span>
                      {word.stats?.mc?.archived && <Sparkles size={12} className="text-orange-500" />}
                    </div>
                    <p className="text-stone-400 text-sm font-medium">{word.definition}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="p-2 text-stone-300 hover:text-[#2D4F1E]"><Volume2 size={20}/></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="p-2 text-stone-200 hover:text-red-500"><Trash2 size={20}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto py-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-stone-100 text-center min-h-[440px] flex flex-col justify-center relative overflow-hidden">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 bg-white/95 backdrop-blur-md animate-in fade-in duration-300">
                  <div className={`p-6 rounded-full mb-4 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-700'}`}>
                    {quizFeedback.status === 'correct' ? <Target size={64} className="animate-bounce" /> : <XCircle size={64} />}
                  </div>
                  <h2 className={`text-2xl font-black mb-3 ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-red-700'}`}>{quizFeedback.status === 'correct' ? 'Bingo!' : 'Oops!'}</h2>
                  <p className="text-sm font-black text-stone-500">{quizFeedback.message}</p>
                </div>
              )}
              {!quizWord ? (
                <div className="text-stone-300 font-black">
                   <Trophy size={48} className="mx-auto mb-4 opacity-20" />
                   單字不足，請先收錄 3 個以上單字！
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest block mb-2">這單字的翻譯是？</span>
                    <h2 className="text-4xl font-black text-stone-800 mb-4">{quizWord.term}</h2>
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-2 bg-stone-50 rounded-lg text-stone-400"><Volume2 size={20}/></button>
                  </div>
                  <div className="grid gap-3">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(opt)} className="py-4 px-6 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold text-stone-700 hover:border-[#2D4F1E]/50 transition-all">
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

      {/* 解析 Modal */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300">
            <div className="bg-[#2D4F1E] p-8 text-white">
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                 <button onClick={() => setSelectedWord(null)} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
              </div>
              <p className="text-white/80 font-bold text-lg">{selectedWord.definition}</p>
            </div>
            
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-stone-400 font-bold">
                  <Loader2 size={32} className="animate-spin" /> 
                  <p>AI 獵人分析中...</p>
                </div>
              ) : explanation && (
                <>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-stone-100 rounded-lg text-xs font-black text-stone-500">{explanation.pos}</span>
                    <span className="px-3 py-1 bg-stone-100 rounded-lg text-xs font-black text-stone-500">{explanation.phonetic}</span>
                  </div>
                  <section>
                    <h4 className="text-[10px] font-black text-stone-300 uppercase mb-2">實戰例句</h4>
                    <p className="font-bold text-stone-800 italic">"{explanation.example_original}"</p>
                    <p className="text-stone-500 text-sm mt-1">{explanation.example_zh}</p>
                  </section>
                  <section>
                    <h4 className="text-[10px] font-black text-stone-300 uppercase mb-2">同義詞</h4>
                    <div className="flex flex-wrap gap-2">
                      {explanation.synonyms?.map((s, i) => <span key={i} className="px-2 py-1 bg-orange-50 text-[#C2410C] rounded-md text-[10px] font-black">{s}</span>)}
                    </div>
                  </section>
                  <section className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <h4 className="text-[10px] font-black text-amber-600 uppercase mb-1 flex items-center gap-1"><Sparkles size={12}/> 獵人提示</h4>
                    <p className="text-sm font-bold text-amber-900 leading-relaxed">{explanation.tips}</p>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 底部進度條 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 z-40">
        <div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-xl border border-stone-100 p-3 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D4F1E] transition-all duration-700" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-sm font-black text-[#2D4F1E]">{Math.round(progress)}% 精通</span>
        </div>
      </div>

      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3">
          <AlertCircle size={18} />
          <span className="font-black text-xs">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={14}/></button>
        </div>
      )}
    </div>
  );
};

export default App;
