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
  CheckCircle2, 
  XCircle, 
  Compass, 
  Trophy, 
  Search, 
  LogOut, 
  Loader2, 
  Medal, 
  AlertCircle,
  LogIn,
  ShieldCheck,
  User
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 配置與安全性處理
// ========================================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "vocabularyh-4c909.firebaseapp.com",
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "vocabularyh-4c909",
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "vocabularyh-4c909.firebasestorage.app",
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "924954723346",
      appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:924954723346:web:cc792c2fdd317fb96684cb",
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

const App = () => {
  const [user, setUser] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  
  const isTransitioning = useRef(false);

  const colors = {
    primary: "bg-[#2D4F1E]", 
    primaryHover: "hover:bg-[#3D662A]",
    accent: "text-[#2D4F1E]",
    bg: "bg-[#FDFCF8]"
  };

  useEffect(() => {
    // 監聽登入狀態
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // 如果在 Canvas 環境，自動嘗試 Token 登入
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      signInWithCustomToken(auth, __initial_auth_token).catch(console.error);
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWords([]);
      return;
    }
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(wordsRef, 
      (snapshot) => {
        const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWords(wordList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      },
      (err) => {
        console.error("Firestore error:", err);
        setErrorMsg("資料載入失敗，請檢查權限設定。");
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Google 登入處理
  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg("Google 登入失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 匿名登入處理
  const handleAnonymousLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setErrorMsg("匿名登入失敗：" + err.message);
    } finally {
      setLoading(false);
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
    
    const isCanvas = window.location.hostname.includes('firebasestorage.googleapis.com') || 
                     window.location.hostname.includes('web-preview') ||
                     typeof __initial_auth_token !== 'undefined';

    const apiKey = isCanvas ? "" : (process.env.REACT_APP_GEMINI_KEY || "");
    const model = "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const translatePrompt = `你是一個專業的翻譯助手。請將${langMode === 'EN' ? '英文' : '日文'}單字 "${newWord.term}" 翻譯成繁體中文，只需提供最簡短精確的一個意思，不要回答其他多餘的字。`;

    try {
      let response;
      let lastError;
      
      for (let i = 0; i < 5; i++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: translatePrompt }] }] })
          });
          
          if (response.status === 403) {
            throw new Error(isCanvas ? "Canvas 權限錯誤 (403)" : "API Key 無效或未授權 (403)。");
          }
          
          if (response.ok) break;
          const errData = await response.json();
          lastError = errData.error?.message || "API 錯誤";
        } catch (e) {
          lastError = e.message;
          if (e.message.includes("403")) break;
        }
        await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
      }

      if (!response || !response.ok) throw new Error(lastError || "無法連線至 API");

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!text) throw new Error("翻譯結果為空");
      setNewWord(prev => ({ ...prev, definition: text }));
    } catch (err) {
      setErrorMsg(`翻譯失敗：${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'vocab'), {
        term: newWord.term.trim(),
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
    } catch (err) { setErrorMsg("儲存失敗。"); }
  };

  const generateQuiz = (currentWords = words) => {
    const allCurrentLang = currentWords.filter(w => w.lang === langMode);
    const eligibleWords = allCurrentLang.filter(w => !w.stats?.mc?.archived);
    if (allCurrentLang.length < 3 || eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }
    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherOptions = allCurrentLang.filter(w => w.id !== randomWord.id).sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.definition);
    setQuizWord(randomWord);
    setOptions([...otherOptions, randomWord.definition].sort(() => 0.5 - Math.random()));
    setQuizFeedback(null);
    isTransitioning.current = false;
  };

  const handleQuizAnswer = async (answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    isTransitioning.current = true;
    const isCorrect = answer === quizWord.definition;
    const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
    const newTotal = stats.total + 1;
    const newCorrect = isCorrect ? stats.correct + 1 : stats.correct;
    const shouldArchive = newCorrect >= 5 && (newCorrect / newTotal) > 0.7;

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      message: isCorrect ? (shouldArchive ? '完美獵取！單字已熟記' : '答對了！') : `正確答案是：${quizWord.definition}` 
    });

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id), { 
        stats: { mc: { total: newTotal, correct: newCorrect, archived: shouldArchive } } 
      });
    } catch (e) {}
    setTimeout(() => generateQuiz(), shouldArchive ? 2000 : 1000);
  };

  useEffect(() => { if (activeTab === 'quiz') generateQuiz(); }, [activeTab, langMode]);

  const currentLangWords = words.filter(w => w.lang === langMode);
  const totalCount = currentLangWords.length;
  const archivedCount = currentLangWords.filter(w => w.stats?.mc?.archived).length;
  const progress = totalCount > 0 ? (archivedCount / totalCount) * 100 : 0;

  // 渲染登入頁面
  if (!user && !loading) {
    return (
      <div className={`min-h-screen ${colors.bg} flex items-center justify-center p-6 font-sans`}>
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 text-center border-2 border-stone-100 relative overflow-hidden">
          {/* 背景裝飾 */}
          <div className="absolute top-0 left-0 w-full h-2 bg-[#2D4F1E]"></div>
          
          <div className="w-20 h-20 bg-[#2D4F1E] rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl rotate-6">
            <Compass className="text-white w-10 h-10" />
          </div>
          
          <h1 className="text-4xl font-black text-[#2D4F1E] mb-4">VocabHunter</h1>
          <p className="text-stone-500 mb-10 font-medium px-4">準備好開始你的單字狩獵之旅了嗎？<br/>登入後進度將永遠儲存在你的皮箱中。</p>
          
          <div className="space-y-3">
            <button 
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white border-2 border-stone-200 hover:border-[#2D4F1E] text-stone-700 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.13-.45-4.69H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.51z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              使用 Google 帳號登入
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-[1px] bg-stone-100"></div>
              <span className="text-stone-300 text-xs font-bold uppercase tracking-widest">或</span>
              <div className="flex-1 h-[1px] bg-stone-100"></div>
            </div>

            <button 
              onClick={handleAnonymousLogin}
              className="w-full py-4 text-stone-400 hover:text-stone-600 font-bold transition-all flex items-center justify-center gap-2"
            >
              <User size={18} />
              先以匿名身份進入
            </button>
          </div>
          
          <div className="mt-10 flex items-center justify-center gap-2 text-stone-300 text-[10px] font-black uppercase tracking-tighter">
            <ShieldCheck size={14} />
            <span>Encrypted & Secured by Firebase</span>
          </div>
          
          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 justify-center">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex flex-col h-screen items-center justify-center bg-[#FDFCF8]">
      <Loader2 className="animate-spin text-[#2D4F1E] w-12 h-12 mb-4" />
      <div className="font-black text-[#2D4F1E] tracking-widest text-xl animate-pulse">正在檢查獵場通行證...</div>
    </div>
  );

  return (
    <div className={`min-h-screen ${colors.bg} text-stone-800 pb-32 font-sans relative`}>
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 px-6 h-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#2D4F1E] rounded-xl shadow-lg rotate-3">
            <Compass className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-black text-[#2D4F1E]">VocabHunter</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-stone-100 p-1 rounded-xl flex border mr-2">
            <button onClick={() => setLangMode('EN')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'JP' ? 'bg-orange-800 text-white' : 'text-stone-400'}`}>JP</button>
          </div>
          <div className="flex items-center gap-2 border-l pl-4 border-stone-200">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full border border-stone-200 shadow-sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-500">
                <User size={16} />
              </div>
            )}
            <button onClick={() => signOut(auth)} className="p-2 text-stone-300 hover:text-red-700 transition-colors"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-100 text-red-700 rounded-2xl flex items-center gap-3 font-bold">
            <AlertCircle size={20} /> {errorMsg}
          </div>
        )}

        <div className="flex bg-[#E5E1D8] p-1 rounded-2xl shadow-inner border mb-8">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>獵場單字庫</button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>挑戰模式</button>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-stone-100">
              <form onSubmit={addWord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input type="text" placeholder="輸入單字..." className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold transition-all" value={newWord.term} onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} />
                    <button type="button" onClick={fetchTranslation} disabled={isProcessing || !newWord.term} className="absolute right-4 top-4 text-[#2D4F1E] hover:scale-110 disabled:opacity-30">
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Search />}
                    </button>
                  </div>
                  <input type="text" placeholder="翻譯結果" className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-medium transition-all" value={newWord.definition} onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} />
                </div>
                <button type="submit" disabled={!newWord.term || !newWord.definition} className={`w-full py-4 rounded-2xl font-black text-white transition-all active:scale-[0.98] shadow-lg disabled:opacity-50 ${colors.primary} ${colors.primaryHover}`}>收錄到皮箱</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentLangWords.length === 0 && <div className="col-span-full py-12 text-center text-stone-400">目前皮箱空空如也...</div>}
              {currentLangWords.map(word => (
                <div key={word.id} className={`bg-white p-5 rounded-3xl border-b-4 border-stone-200 flex justify-between items-center transition-all ${word.stats?.mc?.archived ? 'opacity-40 grayscale' : 'shadow-sm hover:translate-y-[-2px]'}`}>
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black">{word.term}</span>
                      <button onClick={() => speak(word.term, word.lang)} className="text-stone-300 hover:text-[#2D4F1E]"><Volume2 size={16}/></button>
                    </div>
                    <p className="text-stone-500 font-medium">{word.definition}</p>
                    {word.stats?.mc?.archived && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 inline-flex items-center gap-1 mt-2">已熟記</span>}
                  </div>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id))} className="text-stone-200 hover:text-red-800"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[40px] shadow-2xl border-2 border-stone-100 text-center min-h-[480px] flex flex-col justify-center relative overflow-hidden">
            {quizFeedback && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-white/95 backdrop-blur-xl rounded-[40px] animate-in fade-in zoom-in duration-300">
                {quizFeedback.isArchived ? (
                  <div className="text-center">
                    <Medal size={120} className="text-[#2D4F1E] mx-auto mb-6 animate-bounce" />
                    <h2 className="text-3xl font-black mb-2">狩獵成功！</h2>
                    <p className="text-[#2D4F1E] font-bold text-2xl mb-4">"{quizFeedback.term}"</p>
                  </div>
                ) : (
                  <div className="text-center">
                    {quizFeedback.status === 'correct' ? <CheckCircle2 size={100} className="text-green-600 mx-auto mb-6" /> : <XCircle size={100} className="text-red-900 mx-auto mb-6" />}
                    <h2 className={`text-3xl font-black mb-4 ${quizFeedback.status === 'correct' ? 'text-green-700' : 'text-red-900'}`}>{quizFeedback.status === 'correct' ? '正確！' : '可惜...'}</h2>
                  </div>
                )}
              </div>
            )}

            {!quizWord ? (
              <div className="py-12 flex flex-col items-center">
                <Trophy size={64} className="text-[#2D4F1E] mb-6" />
                <h3 className="text-xl font-bold">目前沒有可挑戰的單字</h3>
                <button onClick={() => setActiveTab('list')} className={`mt-6 ${colors.primary} text-white px-10 py-4 rounded-2xl font-bold shadow-lg`}>返回獵場</button>
              </div>
            ) : (
              <div>
                <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-6 bg-stone-50 text-[#2D4F1E] rounded-full border-2 border-stone-100 mb-8 hover:bg-stone-100"><Volume2 size={40}/></button>
                <h2 className="text-5xl font-black mb-12 text-stone-800">{quizWord.term}</h2>
                <div className="grid gap-3">
                  {options.map((opt, i) => (
                    <button key={i} onClick={() => handleQuizAnswer(opt)} className="py-4 px-6 bg-stone-50 border-2 border-stone-200 rounded-2xl font-bold text-stone-700 hover:border-[#2D4F1E] hover:bg-white hover:shadow-md transition-all text-lg">{opt}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-10 left-0 right-0 px-6 z-20">
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-stone-200 p-5 rounded-[30px] shadow-2xl flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 font-black text-stone-700">
            <Compass className="text-[#2D4F1E]" size={20} />
            <span>{archivedCount} / {totalCount}</span>
          </div>
          <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden border">
            <div className="h-full bg-[#2D4F1E] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-2xl font-black text-[#2D4F1E]">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;
