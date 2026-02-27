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
let lastCallTime = 0;

// ========================================================
// 🛠️ Firebase 配置修復 (針對 404 init.json 錯誤)
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
const GEMINI_MODEL = "gemini-2.0-flash-001";

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
// 🏆 勳章門檻配置 (1000 字後每 200 一個標籤，及 3K, 5K, 10K 特殊勳章)
// ========================================================
const getBadgeInfo = (count) => {
  // 巔峰里程碑
  if (count >= 10000) return { label: "真．全知之眼", icon: <Eye />, color: "from-stone-900 via-yellow-600 to-black", threshold: 10000 };
  if (count >= 5000) return { label: "博學聖賢", icon: <Ghost />, color: "from-indigo-900 to-blue-800", threshold: 5000 };
  if (count >= 3000) return { label: "語文宗師", icon: <Gem />, color: "from-fuchsia-600 to-purple-900", threshold: 3000 };
  
  // 1000 字以後的動態門檻 (每 200 一個)
  if (count >= 1000) {
    const step = Math.floor(count / 200) * 200;
    return { label: `${step} 斬傳說`, icon: <ShieldCheck />, color: "from-yellow-500 to-amber-700", threshold: step };
  }

  // 1000 字以前的舊有門檻
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
  
  // 測試門檻
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
  const [langMode, setLangMode] = useState(() => {
    // 優先從本地讀取，讓用戶一進來就看到他熟悉的語言，不會閃爍
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voca_lang_pref') || 'EN';
    }
    return 'EN';
  });
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const apiLock = useRef(false);
  const [spellCheck, setSpellCheck] = useState(null);
  const typingTimer = useRef(null);
  const [toast, setToast] = useState(null); // { msg: string, type: 'success' | 'info' }

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

  // ========================================================
  // 🔐 認證邏輯
  // ========================================================
  useEffect(() => {
      document.title = "VocabHunter | 智慧單字獵場";
      const logoUrl = "/logo.png"; // 確保你的檔案放在 public/logo.png
  
      // 1. 處理標準 Favicon (Chrome, Firefox, etc.)
      const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
      link.rel = 'icon';
      link.href = logoUrl; 
      document.getElementsByTagName('head')[0].appendChild(link);
  
      // 2. 處理 Apple Touch Icon (Safari 存到主畫面專用)
      const appleLink = document.querySelector("link[rel='apple-touch-icon']") || document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.href = logoUrl;
      document.getElementsByTagName('head')[0].appendChild(appleLink);
    
    const initAuth = async () => {
      try {
        // 1. 強制設定 Persistence 以確保重新導向後能保留登入狀態
        await setPersistence(auth, browserLocalPersistence);

        // 2. 處理 Canvas 專用 Token
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // 3. 重要：處理手機 Redirect 登入後的回傳結果
          const result = await getRedirectResult(auth);
          if (result?.user) {
            console.log("Redirect 登入成功:", result.user.email);
            setUser(result.user);
          }
        }
      } catch (err) {
        console.error("Auth Init Error:", err.code, err.message);
        // 如果是跨網域或是 authDomain 沒設好，這裡會報錯
        if (err.code === 'auth/auth-domain-config-required') {
          setErrorMessage("Firebase AuthDomain 配置錯誤，請檢查 Firebase Console 設定。");
        } else {
          setErrorMessage(`認證初始化失敗: ${err.message}`);
        }
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    // 監聽登入狀態改變
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredWords = words.filter(w => w.lang === langMode);
  const totalCount = filteredWords.length;
  const unMasteredWords = words.filter(w => w.lang === langMode && !w.stats?.mc?.archived);
  const masteredCount = filteredWords.filter(w => w.stats?.mc?.archived).length;
  const progressPercent = totalCount > 0 ? (masteredCount / totalCount) * 100 : 0;

  
  // ========================================================
  // 📊 資料同步 (符合 RULE 1 & 2)
  // ========================================================
   useEffect(() => {
    if (!user) return;
  
    // 1. 監聽單字清單 (你原本的邏輯)
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribeWords = onSnapshot(query(wordsRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
      setWords(sorted);
  
      const masteredTotal = data.filter(w => w.stats?.mc?.archived).length;
      const badge = getBadgeInfo(masteredTotal);
      
      if (lastBadgedCount.current === -1) {
          lastBadgedCount.current = badge?.threshold || 0;
          return;
      }
      if (badge && badge.threshold > lastBadgedCount.current) {
        setShowBadge(badge);
        lastBadgedCount.current = badge.threshold;
      }
    });
  
    // 2. 監聽使用者個人設定 (新增的語言同步)
    const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().langPreference) {
        const cloudLang = docSnap.data().langPreference;
        // 只有當雲端與目前不同時才更新，避免無限迴圈
        setLangMode(prev => {
          if (prev !== cloudLang) {
            localStorage.setItem('voca_lang_pref', cloudLang);
            return cloudLang;
          }
          return prev;
        });
      }
    });
  
    return () => {
      unsubscribeWords();
      unsubscribeUser();
    };
  }, [user]);
  const handleLangModeChange = async (newLang) => {
  setLangMode(newLang);
  localStorage.setItem('voca_lang_pref', newLang);
  if (user) {
        try {
          const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
          await updateDoc(userRef, { langPreference: newLang });
        } catch (e) {
          console.error("雲端同步失敗", e);
        }
      }
    };

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

  // 1. 修改同義詞快速加入函式
const addSynonym = async (synonymText) => {
  const term = synonymText.split('(')[0].trim();
  const definition = synonymText.includes('(') 
    ? synonymText.match(/\(([^)]+)\)/)[1] 
    : "由同義詞快速加入";

  // 檢查是否重複
  if (words.some(w => w.lang === langMode && w.term.toLowerCase() === term.toLowerCase())) {
    showToast(`「${term}」已經在獵場中了`, 'info');
    return;
  }

  try {
    const userVocabRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    await addDoc(userVocabRef, {
      term,
      definition,
      lang: langMode,
      createdAt: Date.now(),
      stats: { mc: { correct: 0, total: 0, archived: false } }
    });
    // ✅ 這就是你要的具體感受
    showToast(`已成功捕獲同義詞：${term}`);
  } catch (e) {
    showToast("捕獲失敗，請稍後再試", "error");
  }
};

// 2. 修改 AI 分析函式：新增快取機制

  // ========================================================
  // 🤖 AI 分析
  // ========================================================
  // 統一的分析函式：整合持久化快取與實時分析
const fetchExplanation = async (wordObj, context = "") => {
  // 1. 檢查是否已經有分析結果，有的話直接顯示，不跑 API
  const cacheId = '${word}-${context}'
  
  if (analysisCache.has(cacheId)) {
    console.log("Using cached analysis for:", word);
    return analysisCache.get(cacheId);
  }
  
  if (wordObj.analysis) {
    setSelectedWord(wordObj);
    setExplanation(wordObj.analysis);
    return;
  }

  // 2. 防穿透鎖：如果正在請求中，或是 apiLock 為 true，直接擋掉
  if (isExplaining || apiLock.current) {
    console.log("⚠️ 請求攔截：已有 API 正在執行中");
    return;
  }

  // 3. 嚴格冷卻時間檢查 (5秒)
  const now = Date.now();
  if (now - lastCallTime < 5000) {
    showToast("太快了，獵人還在填彈...", "info");
    return;
  }
  
  // 通過檢查，準備啟動 API
  apiLock.current = true; // 立即上鎖
  setSelectedWord(wordObj);
  setIsExplaining(true);
  setExplanation(null); // 清空舊內容
  lastCallTime = now;
  try {
    const prompt = `你是一位專業的語言導師。請分析單字 "${wordObj.term}" (${wordObj.lang === 'JP' ? '日文' : '英文'})。
        請直接回傳一個 JSON 物件，內容必須使用「繁體中文」：
        
        {
          "phonetic": "讀法(日文給平假名, 英文給音標)",
          "pos": "詞性",
          "example_original": "單句例句(原文)",
          "example_zh": "例句翻譯(繁體中文)",
          "synonyms": ["單字1 （日文給日文單字，英文給英文單字） (解釋1 言簡意賅一點)", "單字2 （日文給日文單字，英文給英文單字） (解釋2 言簡意賅一點)"],
          "tips": "記憶技巧或字根拆解"
        }`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey  // ✅ 這樣 Key 就不會出現在網址列
      },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        // ... 其他設定
      })
    });
    if (!res || !res.ok) {
      const errorData = await res.json();
      // 如果看到 429，顯示更友善的提示
      if (res.status === 429) {
        showToast("Gemini 能量耗盡，請等一分鐘再試", "info");
      }
      throw new Error(`API Error: ${res.status}`);
    }

    const result = await res.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      
      // ✅ 關鍵步驟：將分析結果存回 Firestore，下次開啟時，wordObj.analysis 就會有值了
      const wordDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', wordObj.id);
      await updateDoc(wordDocRef, { analysis: parsed });

      analysisCache.set(cacheId, parsed);
      setExplanation(parsed);
    }
  } catch (e) { 
    console.error("AI Analysis Error", e);
    // 針對 429 給予特定提示
    const errorMsg = e.message.includes("429") ? "API 次數達上限，請等 30 秒再試" : "AI 獵人暫時失手";
    showToast(errorMsg, "error");
  } finally { 
    setIsExplaining(false); 
  }
};

  // ========================================================
  // 🏁 測驗邏輯
  // ========================================================
  const generateQuiz = () => {
    const pool = words.filter(w => w.lang === langMode && (!w.stats?.mc?.archived));
    if (pool.length < 3) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const others = pool.filter(w => w.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 2).map(w => w.definition);
    setQuizWord(target);
    const shuffledDistractors = [target.definition, ...others].sort(() => 0.5 - Math.random());
    const quizOptions = [...shuffledDistractors, "我不確定"];
    setOptions(quizOptions);
    isTransitioning.current = false;
  };

  useEffect(() => { if (activeTab === 'quiz') generateQuiz(); }, [activeTab, langMode, words.length]);

  const handleQuizAnswer = async (ans) => {
    if (quizFeedback || !quizWord || isTransitioning.current || !user) return;
    isTransitioning.current = true;
  
    const isUncertain = ans === "我不確定";
    const isCorrect = ans === quizWord.definition;
  
    // 設定回饋訊息
    if (isCorrect) {
      setQuizFeedback({ 
        status: 'correct', 
        message: '🎯 完美擊中！' 
      });
    } else if (isUncertain) {
      setQuizFeedback({ 
        status: 'wrong', 
        message: `💡 沒關係，這隻獵物是：${quizWord.definition}` 
      });
    } else {
      setQuizFeedback({ 
        status: 'wrong', 
        message: `🍃 失手了！答案是：${quizWord.definition}` 
      });
    }
    speak(quizWord.term, quizWord.lang);
    
    // 只有在完全正確時才更新資料庫中的熟練度
    if (isCorrect) {
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const newCorrect = stats.correct + 1;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(docRef, { 
        "stats.mc": { 
          total: stats.total + 1, 
          correct: newCorrect, 
          archived: newCorrect >= 3 
        } 
      });
    } else {
      // 如果選擇「我不確定」或「答錯」，可以選擇增加 total 次數但不增加 correct，或是乾脆不更新
      const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
      await updateDoc(docRef, { 
        "stats.mc": { ...stats, total: stats.total + 1 } 
      });
    }
  
    setTimeout(() => { 
      setQuizFeedback(null); 
      generateQuiz(); 
    }, 1600);
  };

  const progress = words.filter(w => w.lang === langMode).length > 0 
    ? (words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length / words.filter(w => w.lang === langMode).length) * 100 
    : 0;

  if (authLoading) return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
      <div className="relative">
        <Loader2 className="animate-spin text-[#2D4F1E] w-16 h-16" />
        <Compass className="absolute inset-0 m-auto text-[#2D4F1E]/20 w-8 h-8" />
      </div>
      <p className="mt-6 font-black text-[#2D4F1E] tracking-[0.2em] animate-pulse text-sm">正在進入獵場...</p>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-5%] right-[-5%] w-64 h-64 bg-[#2D4F1E]/5 rounded-full blur-3xl"></div>
        <div className="w-full max-w-sm bg-white p-10 rounded-[3.5rem] shadow-[0_20px_50px_rgba(45,79,30,0.1)] text-center border border-stone-100 z-10">
          <div className="w-28 h-28 bg-[#2D4F1E] rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-xl transform -rotate-3 hover:rotate-0 transition-transform duration-500 overflow-hidden p-2">
            <img 
              src="/logo.png" 
              alt="VocabHunter Logo" 
              className="w-full h-full object-contain scale-110" 
            />
          </div>
          <h1 className="text-4xl font-black text-stone-800 mb-3 tracking-tight">VocabHunter</h1>
          <p className="text-stone-400 font-bold mb-10 leading-relaxed px-4">捕捉單字，建立屬於你的<br/>智慧獵場</p>
          <div className="space-y-4">
            <button 
    
              onClick={() => signInWithPopup(auth, provider)}
              className="w-full py-4 bg-white border-2 border-stone-100 rounded-2xl font-bold text-stone-700 flex items-center justify-center gap-3 hover:bg-stone-50 transition-all active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
              Google 帳號登入
            </button>
          

            <div className="py-2 flex items-center gap-2">
              <div className="h-px bg-stone-100 flex-1"></div>
              <span className="text-[10px] text-stone-300 font-bold">OR</span>
              <div className="h-px bg-stone-100 flex-1"></div>
            </div>
            <button onClick={() => signInAnonymously(auth)} className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:shadow-lg transition-all active:scale-95">
              <UserCircle size={20} /> 匿名獵人試玩
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FDFCF8] text-stone-800 pb-36 font-sans select-none overflow-x-hidden">
      <header className="bg-white/80 backdrop-blur-2xl border-b border-stone-100 sticky top-0 z-40 px-4 h-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 group cursor-pointer shrink-0">
          <div className="relative">
            <div className="bg-[#2D4F1E] p-1 rounded-xl shadow-lg rotate-[-5deg] group-hover:rotate-0 transition-transform duration-300 w-10 h-10 flex items-center justify-center overflow-hidden">
              <img 
                src="/logo.png" 
                alt="VocabHunter Logo" 
                className="w-full h-full object-contain scale-125" 
              />
            </div>
          </div>
          
          {/* 1. 縮小後的字體大小：text-lg */}
          <div className="flex flex-col leading-tight">
            <span className="font-black text-lg text-stone-800 tracking-tighter">
              Vocab<span className="text-[#2D4F1E]">Hunter</span>
            </span>
            <span className="text-[8px] font-black text-stone-400 tracking-[0.1em] uppercase">
              Smart Vocab
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 2. 移除此處原本的 Badge Info 以維持簡潔 */}
          
          {/* 語言切換 */}
          <div className="bg-stone-100 p-1 rounded-xl flex border border-stone-200/50 scale-90 sm:scale-100">
            {['EN', 'JP'].map(l => (
            <button 
              key={l} 
              onClick={() => handleLangModeChange(l)} // 這裡改成呼叫 handleLangModeChange
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === l ? (l === 'EN' ? 'bg-[#2D4F1E]' : 'bg-[#C2410C]') + ' text-white shadow-md' : 'text-stone-400'}`}
            >
              {l}
            </button>
          ))}
          </div>

          <div className="h-8 w-px bg-stone-100 mx-1"></div>

          {/* 使用者資訊與明顯的登出按鈕 */}
          <div className="flex items-center gap-1 sm:gap-2">
            {user.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-stone-100" />
            ) : (
              <UserCircle size={24} className="text-stone-300" />
            )}
            
            {/* 登出按鈕增加背景色，確保在右上角更易觸及 */}
            <button 
              onClick={() => signOut(auth)} 
              className="ml-1 p-2 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all active:scale-90"
              title="登出"
            >
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 md:p-8">
        <div className="flex bg-stone-100/50 p-1.5 rounded-[2rem] mb-8 border border-stone-200/30">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-4 rounded-[1.6rem] font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'list' ? 'bg-white shadow-md text-[#2D4F1E]' : 'text-stone-400'}`}>
            <BookOpen size={20}/> 我的獵場
          </button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-4 rounded-[1.6rem] font-black text-sm flex items-center justify-center gap-2 transition-all ${activeTab === 'quiz' ? 'bg-white shadow-md text-[#2D4F1E]' : 'text-stone-400'}`}>
            <Trophy size={20}/> 捕獲練習
          </button>
        </div>

        {activeTab === 'list' ? (
          <div className="flex flex-col gap-8 animate-in fade-in duration-500">
            <form onSubmit={addWord} className={`bg-white p-6 md:p-8 rounded-[2.5rem] shadow-[0_15px_40px_rgba(0,0,0,0.03)] border border-stone-100 space-y-4 ${duplicateAlert ? 'animate-shake border-red-200' : ''}`}>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder={langMode === 'JP' ? "輸入日文單字..." : "輸入英文單字..."} 
                  className="w-full px-6 py-5 bg-stone-50 border-2 border-transparent rounded-[1.8rem] focus:border-[#2D4F1E]/10 focus:bg-white outline-none font-black text-xl transition-all" 
                  value={newWord.term} 
                  onChange={(e) => handleInputChange(e.target.value)} 
                />
                <button 
                  type="button" 
                  onClick={() => checkAndTranslate(newWord.term)} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#2D4F1E] w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm border border-stone-100 active:scale-90 transition-all"
                >
                  {isProcessing ? <Loader2 className="animate-spin w-5 h-5"/> : <Search size={22}/>}
                </button>
              </div>

              {spellCheck && (
                <div className="flex items-center gap-3 text-amber-700 bg-amber-50 px-5 py-4 rounded-2xl border border-amber-100 animate-in slide-in-from-top-2">
                  <AlertCircle size={18} className="shrink-0"/>
                  <div className="text-sm font-bold">
                    您是指 <button type="button" onClick={() => { setNewWord(p => ({...p, term: spellCheck})); setSearchTerm(spellCheck); setSpellCheck(null); checkAndTranslate(spellCheck); }} className="mx-1 px-2 py-0.5 bg-amber-200/50 rounded-lg text-amber-900 underline decoration-2">{spellCheck}</button> 嗎？
                  </div>
                </div>
              )}
              
              {searchTerm && (
                <div className="animate-in fade-in slide-in-from-top-2 space-y-4">
                  <input 
                    type="text" 
                    placeholder="翻譯結果..." 
                    className="w-full px-6 py-5 bg-stone-50 border-2 border-transparent rounded-[1.8rem] focus:border-[#2D4F1E]/10 focus:bg-white outline-none font-bold text-stone-600 text-base transition-all" 
                    value={newWord.definition} 
                    onChange={(e) => setNewWord({...newWord, definition: e.target.value})} 
                  />
                  <button type="submit" className="w-full py-5 bg-[#2D4F1E] text-white rounded-[1.8rem] font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-[#2D4F1E]/10">
                    <Plus size={24}/> 收錄單字
                  </button>
                </div>
              )}
            </form>

            <div className="space-y-4">
              {words.filter(w => w.lang === langMode && w.term.toLowerCase().includes(searchTerm.toLowerCase())).map(word => (
                <div 
                  key={word.id} 
                  onClick={() => fetchExplanation(word)} 
                  className="group bg-white p-6 rounded-[2rem] border border-stone-50 shadow-sm flex justify-between items-center hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-2xl text-stone-800">{word.term}</span>
                      {word.stats?.mc?.archived && (
                        <div className="bg-orange-50 text-orange-600 px-2 py-1 rounded-lg flex items-center gap-1 animate-pulse">
                          <Award size={14} className="fill-orange-500"/>
                          <span className="text-[10px] font-black">MASTERED</span>
                        </div>
                      )}
                    </div>
                    <div className="text-stone-400 font-bold mt-1 line-clamp-1">{word.definition}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="w-12 h-12 flex items-center justify-center text-stone-200 hover:text-[#2D4F1E] transition-all">
                      <Volume2 size={24}/>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="w-12 h-12 flex items-center justify-center text-stone-100 hover:text-red-400 transition-all">
                      <Trash2 size={20}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto animate-in zoom-in duration-300">
            <div className="bg-white p-10 rounded-[3.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.05)] border border-stone-100 text-center min-h-[520px] flex flex-col justify-between relative overflow-hidden">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm animate-in fade-in zoom-in">
                  <div className={`p-10 rounded-full mb-8 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600 shadow-xl shadow-green-100' : 'bg-red-50 text-red-600 shadow-xl shadow-red-100'}`}>
                    {quizFeedback.status === 'correct' ? <Target size={100} className="animate-bounce" /> : <X size={100} />}
                  </div>
                  <h2 className="text-3xl font-black mb-4 tracking-tight">{quizFeedback.status === 'correct' ? '擊中標靶！' : '失手了！'}</h2>
                  <p className="font-black text-stone-500 text-lg">{quizFeedback.message}</p>
                </div>
              )}

              {words.filter(w => w.lang === langMode && !w.stats?.mc?.archived).length < 3 ? (
                  <div className="my-auto flex flex-col items-center justify-center space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="relative">
                      <div className="w-24 h-24 bg-orange-50 rounded-[2rem] flex items-center justify-center text-orange-500 transform rotate-12">
                        <AlertCircle size={48} />
                      </div>
                      <Plus size={24} className="absolute -bottom-2 -right-2 text-[#2D4F1E] bg-white rounded-full shadow-md p-1"/>
                    </div>
                    <div className="space-y-3 text-center">
                      <h3 className="text-2xl font-black text-stone-800">獵場資源不足</h3>
                      <p className="text-stone-400 font-bold leading-relaxed px-6">
                        目前沒有足夠的「待捕捉」獵物...<br/>
                        請至少收錄 <span className="text-orange-600">3 個</span> 未精通單字來啟動。
                      </p>
                    </div>
                    <button 
                      onClick={() => setActiveTab('list')}
                      className="px-8 py-4 bg-[#2D4F1E] text-white rounded-2xl font-black shadow-lg shadow-[#2D4F1E]/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Compass size={18} /> 前往捕獲新單字
                    </button>
                  </div>
                ) : !quizWord ? (
  <div className="my-auto py-20 flex flex-col items-center gap-6">
                  <Loader2 className="animate-spin text-[#2D4F1E]/20 w-16 h-16" />
                  <p className="font-black text-stone-300 tracking-widest text-xs uppercase">Tracking Target...</p>
                </div>
              ) : (
                <>
                  <div className="mb-10 pt-6">
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="w-24 h-24 bg-[#2D4F1E] rounded-[2.5rem] text-white shadow-2xl flex items-center justify-center mx-auto mb-8 active:scale-90 transition-all group">
                      <Volume2 size={48} className="group-hover:rotate-6 transition-transform"/>
                    </button>
                    <h2 className="text-5xl font-black text-stone-800 tracking-tight">{quizWord.term}</h2>
                  </div>
                  <div className="grid gap-4">
                    {options.map((opt, i) => (
                      <button 
                          key={i} 
                          onClick={() => handleQuizAnswer(opt)} 
                          className={`py-5 px-8 rounded-[1.8rem] font-black text-lg shadow-sm transition-all border-2 
                            ${opt === "我不確定" 
                              ? "bg-stone-100 border-transparent text-stone-400 hover:bg-stone-200" 
                              : "bg-stone-50 border-stone-50 text-stone-700 hover:bg-white hover:border-[#2D4F1E]/20 active:bg-[#2D4F1E] active:text-white"
                            }`}
                        >
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

{/* 🏅 勳章解鎖彈窗 (支援巔峰勳章) */}
      {showBadge && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-stone-900/90 backdrop-blur-xl" onClick={() => setShowBadge(null)}></div>
          <Confetti />
          <div className={`relative w-full max-w-sm bg-gradient-to-br ${showBadge.color} p-1 rounded-[4rem] shadow-2xl animate-in zoom-in spin-in-1 duration-700 z-[130]`}>
            <div className="bg-white rounded-[3.8rem] p-10 text-center space-y-8 overflow-hidden relative">
              {/* 巔峰特效背景 */}
              {showBadge.threshold >= 3000 && (
                <div className={`absolute inset-0 opacity-10 bg-gradient-to-tr ${showBadge.color} animate-pulse`}></div>
              )}
              <div className={`w-28 h-28 mx-auto rounded-[2.5rem] flex items-center justify-center bg-gradient-to-br ${showBadge.color} shadow-2xl text-white animate-bounce-slow relative`}>
                <div className="absolute inset-0 bg-white/20 rounded-[2.5rem] animate-ping opacity-30"></div>
                {React.cloneElement(showBadge.icon, { size: 56, strokeWidth: 2.5 })}
              </div>
              <div className="space-y-3 relative z-10">
                <p className="text-stone-400 font-black tracking-[0.3em] text-[10px] uppercase">
                  {showBadge.threshold >= 3000 ? "Legendary Achievement" : "Achievement Unlocked"}
                </p>
                <h2 className="text-4xl font-black text-stone-800 tracking-tight">{showBadge.label}</h2>
                <div className="bg-stone-50 py-2 px-4 rounded-full inline-block">
                  <p className="text-stone-500 font-black text-xs">成功熟記了 {showBadge.threshold} 個單字！</p>
                </div>
              </div>
              <button onClick={() => setShowBadge(null)} className={`relative z-10 w-full py-5 rounded-[1.8rem] bg-gradient-to-r ${showBadge.color} text-white font-black shadow-lg active:scale-95 transition-all text-lg`}>收下榮耀</button>
            </div>
          </div>
        </div>
      )}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[3.5rem] md:rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-in slide-in-from-bottom-20 duration-500">
            <div className={`${selectedWord.lang === 'JP' ? 'bg-[#C2410C]' : 'bg-[#2D4F1E]'} px-8 pt-12 pb-10 text-white`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <h2 className="text-4xl font-black tracking-tight">{selectedWord.term}</h2>
                    <button onClick={() => speak(selectedWord.term, selectedWord.lang)} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl backdrop-blur transition-all active:scale-90">
                      <Volume2 size={22}/>
                    </button>
                  </div>
                  <p className="text-white/80 font-bold text-xl mt-2">{selectedWord.definition}</p>
                </div>
                <button onClick={() => setSelectedWord(null)} className="w-12 h-12 flex items-center justify-center bg-black/10 hover:bg-black/20 rounded-full transition-all">
                  <X size={24}/>
                </button>
              </div>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
              {isExplaining ? (
                <div className="py-24 text-center">
                  <Sparkles className="mx-auto mb-6 animate-pulse text-[#2D4F1E]/20" size={80} />
                  <p className="font-black text-stone-300 tracking-[0.3em] text-xs uppercase">AI Hunter Analyzing...</p>
                </div>
              ) : explanation && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-stone-50 p-5 rounded-[1.8rem] border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest mb-2">詞性</p>
                      <p className="font-black text-stone-700 text-lg">{explanation.pos}</p>
                    </div>
                    <div className="bg-stone-50 p-5 rounded-[1.8rem] border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest mb-2">讀法/音標</p>
                      <p className="font-black text-[#2D4F1E] text-lg font-mono">{explanation.phonetic}</p>
                    </div>
                  </div>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between font-black text-stone-300 text-[10px] uppercase tracking-widest">
                      <span className="flex items-center gap-2"><PlayCircle size={14}/> 實戰例句</span>
                    </div>
                    <div className="bg-stone-50 p-6 rounded-[2rem] border-l-[6px] border-[#2D4F1E] shadow-sm group relative">
                      <button 
                        onClick={() => speak(explanation.example_original, selectedWord.lang)}
                        className="absolute right-4 top-4 p-3 bg-white text-[#2D4F1E] rounded-xl shadow-sm border border-stone-100 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                      >
                        <Volume2 size={16}/>
                        <span className="text-[10px] font-black"></span>
                      </button>
                      <p className="font-black text-stone-800 mb-3 leading-relaxed text-xl italic pr-10">
                        "{explanation.example_original}"
                      </p>
                      <p className="text-stone-500 font-bold text-base">{explanation.example_zh}</p>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between font-black text-stone-300 text-[10px] uppercase tracking-widest">
                      <span className="flex items-center gap-2"><Layers size={14}/> 同義詞參考 (點擊快速收錄)</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {explanation.synonyms?.map((s, i) => (
                        <button 
                          key={i} 
                          onClick={() => addSynonym(s)}
                          className="group relative px-5 py-3 bg-white border border-stone-100 text-stone-600 rounded-2xl text-sm font-black shadow-sm hover:border-[#2D4F1E] hover:text-[#2D4F1E] active:scale-90 transition-all flex items-center gap-2"
                        >
                          {s}
                          <Plus size={14} className="text-stone-300 group-hover:text-[#2D4F1E]" />
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="bg-orange-50/50 p-6 rounded-[2.5rem] border border-orange-100/50 relative overflow-hidden group">
                    <Flame className="absolute -right-2 -bottom-2 text-orange-100 group-hover:text-orange-200 transition-colors" size={80} />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 font-black text-orange-600 text-[10px] uppercase tracking-widest mb-3">
                        <Sparkles size={14}/> 獵人記憶提示
                      </div>
                      <p className="text-orange-900 font-bold text-base leading-relaxed">
                        {explanation.tips}
                      </p>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 left-6 right-6 z-40">
  <div className="max-w-md mx-auto bg-white/70 backdrop-blur-2xl border border-stone-100 p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.08)] flex items-center gap-5">
    
    {/* 🏅 勳章位置移到這裡 */}
          <div className="relative">
            {(() => {
              const masteredTotal = words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length;
              const badge = getBadgeInfo(masteredTotal);
              return badge ? (
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${badge.color} flex items-center justify-center text-white shadow-lg animate-pulse`}>
                  {React.cloneElement(badge.icon, { size: 28 })}
                </div>
              ) : (
                <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-300">
                  <Trophy size={28} />
                </div>
              );
            })()}
          </div>
      
          <div className="flex-1 flex flex-col gap-2.5">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-0.5">
                  {(() => {
                    const masteredTotal = words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length;
                    const badge = getBadgeInfo(masteredTotal);
                    return badge ? badge.label : "正在修練";
                  })()}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-black text-xl text-[#2D4F1E]">{masteredCount}</span>
                  <span className="text-stone-300 text-xs font-bold">/ {totalCount} 單字</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-black text-lg text-[#2D4F1E]">{Math.round(progressPercent)}%</span>
              </div>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden shadow-inner border border-stone-50">
              <div 
                className={`h-full transition-all duration-1000 ease-out ${progressPercent === 100 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-[#2D4F1E] to-[#4c8133]'}`} 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4">
          <div className={`px-6 py-3 rounded-full shadow-2xl border flex items-center gap-2 font-black text-sm ${
            toast.type === 'info' ? 'bg-stone-800 text-white border-stone-700' : 'bg-[#2D4F1E] text-white border-green-800'
          }`}>
            {toast.type === 'info' ? <Search size={16}/> : <CheckCircle2 size={16}/>}
            {toast.msg}
          </div>
        </div>
      )}
      <style>{`
        /* 讓全站預設字體稍微縮小一點 */
        :root { font-size: 14px; } 
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        body { overflow-x: hidden; touch-action: manipulation; -webkit-font-smoothing: antialiased; }
      `}</style>
    </div>
  );
};

export default App;
