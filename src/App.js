import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCustomToken,
  onAuthStateChanged,
  signOut
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
  Leaf
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 配置與安全性處理
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vocabularyh-4c909';

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
  const nextQuizTimeout = useRef(null);

  const colors = {
    primary: "bg-[#2D4F1E]", 
    primaryHover: "hover:bg-[#3D662A]",
    accent: "text-[#2D4F1E]",
    bg: "bg-[#FDFCF8]"
  };

  // 1. 初始化驗證 (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (!auth.currentUser) {
          // 如果沒有 Token 且未登入，才嘗試匿名或等待 Popup
        }
      } catch (err) {
        console.error("Auth Init Error:", err);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  // 2. 監聽 Firestore 資料 (RULE 1 & 2)
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
        setErrorMsg("讀取資料失敗，請檢查權限設定。");
      }
    );
    return () => unsubscribe();
  }, [user]);

  const speak = (text, lang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  // Gemini 翻譯功能
  const fetchTranslation = async () => {
    if (!newWord.term) return;
    setIsProcessing(true);
    setErrorMsg(null);
    
    // API 金鑰在 Canvas 環境中由系統自動處理，此處留空
    const apiKey = process.env.REACT_APP_GEMINI_KEY;
    const model = "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const translatePrompt = `將${langMode === 'EN' ? '英文' : '日文'}單字 "${newWord.term}" 翻譯成繁體中文，僅提供最簡短的一個意思。`;
      
      let retryCount = 0;
      const maxRetries = 5;
      let response;

      while (retryCount < maxRetries) {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: translatePrompt }] }] })
        });
        if (response.ok) break;
        retryCount++;
        await new Promise(res => setTimeout(res, Math.pow(2, retryCount) * 1000));
      }

      if (!response.ok) throw new Error("API failed after retries");

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      setNewWord(prev => ({ ...prev, definition: text }));
    } catch (err) {
      setErrorMsg("翻譯功能暫時無法使用。");
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
    const eligibleWords = currentWords.filter(w => !w.stats?.mc?.archived && w.lang === langMode);
    const allCurrentLang = currentWords.filter(w => w.lang === langMode);
    
    if (allCurrentLang.length < 3) {
      setQuizWord(null);
      return;
    }

    if (eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }

    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherWords = allCurrentLang.filter(w => w.id !== randomWord.id);
    const shuffledOthers = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
    const optionsSet = [...shuffledOthers.map(w => w.definition), randomWord.definition];
    
    setQuizWord(randomWord);
    setOptions(optionsSet.sort(() => 0.5 - Math.random()));
    setQuizFeedback(null);
    isTransitioning.current = false;
  };

  const handleQuizAnswer = async (answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    
    isTransitioning.current = true;
    const isCorrect = answer === quizWord.definition;
    const currentStats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
    
    const newTotal = currentStats.total + 1;
    const newCorrect = isCorrect ? currentStats.correct + 1 : currentStats.correct;
    const shouldArchive = newCorrect >= 5 && (newCorrect / newTotal) > 0.7;

    const updatedStats = { mc: { total: newTotal, correct: newCorrect, archived: shouldArchive } };

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      message: isCorrect ? (shouldArchive ? '完美獵取！單字已收錄' : '答對了！') : `正確答案是：${quizWord.definition}` 
    });

    try {
      const wordRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(wordRef, { stats: updatedStats });
    } catch (e) {
      console.error("Update error:", e);
    }

    if (nextQuizTimeout.current) clearTimeout(nextQuizTimeout.current);
    nextQuizTimeout.current = setTimeout(() => generateQuiz(), shouldArchive ? 2000 : 1000);
  };

  useEffect(() => {
    if (activeTab === 'quiz') generateQuiz();
  }, [activeTab, langMode]);

  const totalCount = words.filter(w => w.lang === langMode).length;
  const archivedCount = words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length;
  const progress = totalCount > 0 ? (archivedCount / totalCount) * 100 : 0;

  if (loading) return <div className="flex h-screen items-center justify-center font-bold">載入中...</div>;

  if (!user) return (
    <div className={`flex h-screen items-center justify-center ${colors.bg} p-6`}>
      <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border">
        <div className="mb-10 flex justify-center scale-110">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-[#2D4F1E] rounded-2xl shadow-lg rotate-3">
              <Compass className="text-white w-7 h-7" />
            </div>
            <span className="text-3xl font-black text-[#2D4F1E]">VocabHunter</span>
          </div>
        </div>
        <h1 className="text-xl font-bold mb-8 text-[#2D4F1E]">智慧單字探險家</h1>
        <button onClick={() => signInWithPopup(auth, provider)} className={`w-full ${colors.primary} text-white py-5 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform`}>Google 快速登入</button>
      </div>
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
          <div className="bg-stone-100 p-1 rounded-xl flex border">
            <button onClick={() => setLangMode('EN')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white shadow-sm' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'JP' ? 'bg-orange-800 text-white shadow-sm' : 'text-stone-400'}`}>JP</button>
          </div>
          <button onClick={() => signOut(auth)} className="p-2 text-stone-300 hover:text-red-700 transition-colors"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {errorMsg && (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-100 text-red-700 rounded-2xl flex items-center gap-3 font-bold">
            <AlertCircle size={20} /> {errorMsg}
          </div>
        )}

        <div className="flex bg-[#E5E1D8] p-1 rounded-2xl shadow-inner border mb-8">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>獵場單字庫</button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>選擇挑戰</button>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-stone-100">
              <form onSubmit={addWord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input type="text" placeholder="輸入單字..." className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold transition-all" value={newWord.term} onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} />
                    <button type="button" onClick={fetchTranslation} className="absolute right-4 top-4 text-[#2D4F1E] hover:scale-110 transition-transform">
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Search />}
                    </button>
                  </div>
                  <input type="text" placeholder="翻譯結果" className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-medium transition-all" value={newWord.definition} onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} />
                </div>
                <button type="submit" className={`w-full py-4 rounded-2xl font-black text-white transition-all active:scale-[0.98] shadow-lg ${colors.primary} ${colors.primaryHover}`}>收錄到皮箱</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {words.filter(w => w.lang === langMode).map(word => (
                <div key={word.id} className={`bg-white p-5 rounded-3xl border-b-4 border-stone-200 flex justify-between items-center transition-all ${word.stats?.mc?.archived ? 'opacity-40 grayscale' : 'shadow-sm hover:translate-y-[-2px]'}`}>
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black">{word.term}</span>
                      <button onClick={() => speak(word.term, word.lang)} className="text-stone-300 hover:text-[#2D4F1E]"><Volume2 size={16}/></button>
                    </div>
                    <p className="text-stone-500 font-medium">{word.definition}</p>
                    {word.stats?.mc?.archived && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 inline-flex items-center gap-1 mt-2"><CheckCircle2 size={10} /> 已熟記</span>}
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
                    <Medal size={120} className="text-[#2D4F1E] mx-auto mb-6 drop-shadow-md animate-bounce" />
                    <h2 className="text-3xl font-black mb-2 text-stone-800">狩獵成功！</h2>
                    <p className="text-[#2D4F1E] font-bold text-2xl mb-4">"{quizFeedback.term}"</p>
                    <p className="text-stone-400 font-medium">此單字已完全進入你的獵人皮箱</p>
                  </div>
                ) : (
                  <div className="text-center">
                    {quizFeedback.status === 'correct' ? <CheckCircle2 size={100} className="text-green-600 mx-auto mb-6" /> : <XCircle size={100} className="text-red-900 mx-auto mb-6" />}
                    <h2 className={`text-3xl font-black mb-4 ${quizFeedback.status === 'correct' ? 'text-green-700' : 'text-red-900'}`}>{quizFeedback.status === 'correct' ? '正確！' : '可惜...'}</h2>
                    <p className="text-stone-600 text-lg font-bold">{quizFeedback.message}</p>
                  </div>
                )}
              </div>
            )}

            {!quizWord ? (
              <div className="py-12 flex flex-col items-center">
                {totalCount < 3 ? (
                  <>
                    <AlertCircle size={48} className="text-stone-300 mb-4" />
                    <h3 className="text-xl font-bold mb-2">獵物不足</h3>
                    <p className="text-stone-500 mb-6">需至少 3 個單字才能挑戰</p>
                  </>
                ) : (
                  <>
                    <Trophy size={64} className="text-[#2D4F1E] mb-6 animate-pulse" />
                    <h3 className="text-xl font-bold text-stone-800">所有單字已熟記！</h3>
                    <p className="text-stone-500 mt-2">快去尋找更多新的獵物吧</p>
                  </>
                )}
                <button onClick={() => setActiveTab('list')} className={`mt-6 ${colors.primary} text-white px-10 py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all`}>返回獵場</button>
              </div>
            ) : (
              <div className="animate-in fade-in duration-500">
                <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-6 bg-stone-50 text-[#2D4F1E] rounded-full border-2 border-stone-100 mb-8 active:scale-90 transition-transform"><Volume2 size={40}/></button>
                <h2 className="text-5xl font-black mb-12 text-stone-800 tracking-tight">{quizWord.term}</h2>
                <div className="grid gap-3">
                  {options.map((opt, i) => (
                    <button key={i} onClick={() => handleQuizAnswer(opt)} className="py-4 px-6 bg-stone-50 border-2 border-stone-200 rounded-2xl font-bold text-stone-700 hover:border-[#2D4F1E] hover:bg-white hover:shadow-md transition-all active:scale-95 text-lg">{opt}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 固定進度條 */}
      <div className="fixed bottom-10 left-0 right-0 px-6 z-20">
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-stone-200 p-5 rounded-[30px] shadow-2xl flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Compass className="text-[#2D4F1E]" size={20} />
            <span className="font-black text-stone-700 hidden sm:inline">探險進度 {archivedCount} / {totalCount}</span>
            <span className="font-black text-stone-700 sm:hidden">{archivedCount}/{totalCount}</span>
          </div>
          <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden border">
            <div className="h-full bg-[#2D4F1E] transition-all duration-1000 shadow-[0_0_10px_rgba(45,79,30,0.3)]" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-2xl font-black text-[#2D4F1E]">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;
