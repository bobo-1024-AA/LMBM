/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  BookOpen, 
  BadgeCheck, 
  SearchCode, 
  RotateCcw, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Home as HomeIcon, 
  Library, 
  Calendar, 
  User,
  Settings,
  ArrowLeft,
  QrCode,
  Star,
  Wallet,
  CalendarCheck,
  History,
  X,
  CheckCircle2,
  Clock,
  MapPin,
  Scan,
  Filter,
  ArrowUpDown,
  LogOut,
  Lock,
  Building2,
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations, Language } from './translations';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, updateDoc, addDoc, query, where, getDoc, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { AdminDashboard } from './components/AdminDashboard';
import { Toast, ToastType, ConfirmDialog } from './components/ui/Feedback';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---

type View = 'login' | 'home' | 'bookshelf' | 'events' | 'profile' | 'bookDetail' | 'adminDashboard' | 'trackingList';
type UserRole = 'admin' | 'user';

interface LibraryUser {
  id: string;
  memberId: string;
  name: string;
  avatar: string;
  borrowedBooks: string[]; // IDs of books
}

type TrackingStatus = 'approved' | 'waiting_to_send' | 'please_send' | 'sent' | 'delivered' | 'completed';

interface Request {
  id: string;
  userId: string;
  userName: string;
  bookId: string;
  bookTitle: string | { [key in Language]: string };
  type: 'borrow' | 'return' | 'renew';
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  days?: number; // for renewal
  trackingStatus?: TrackingStatus;
  completedAt?: string;
  deliveryMethod?: 'pickup' | 'delivery';
}

interface Book {
  id: string;
  title: string | { [key in Language]: string };
  author: string | { [key in Language]: string };
  cover: string;
  category: string; // This will now be a key for translations
  description: {
    en: string;
    'zh-HK': string;
  };
  quantity: number;
  availableQuantity?: number;
}

interface Activity {
  id: string;
  type: 'borrow' | 'event' | 'return' | 'renew';
  title: string;
  subtitle: string;
  date: string;
  points?: string;
  details?: {
    description?: string;
    location?: string;
    time?: string;
    borrowDate?: string;
    remainingDays?: number;
    progress?: string;
    applicationDate?: string;
    status?: string;
    trackingStatus?: string;
  };
}

interface LibraryEvent {
  id: string;
  title: { [key in Language]: string };
  date: string;
  time: string;
  location: { [key in Language]: string };
  image: string;
  category: string;
  agenda?: { [key in Language]: string[] };
}

interface Notification {
  id: string;
  title: string | { [key in Language]: string };
  message: string | { [key in Language]: string };
  date: string;
  type: 'success' | 'info' | 'admin';
  isRead: boolean;
}

interface ShippingAddress {
  id: string;
  recipientName: string;
  phoneNumber: string;
  detailedAddress: string;
  isDefault: boolean;
}

// --- Mock Data ---

const ALL_BOOKS: Book[] = [
  {
    id: '1',
    title: { en: 'Meditations', 'zh-HK': '沉思錄' },
    author: { en: 'Marcus Aurelius', 'zh-HK': '馬可·奧里略' },
    category: 'catPhilosophy',
    cover: 'https://lh3.googleusercontent.com/aida-public/AB6AXuApkjRdtjlTdnDUFMPgXDl6h2q1v6elTCem0bmkVQihkGqDtpEOEZ0MVeJkf2Pl7_lobvxx3vRaJl9dJNXiKmuWjzwR-s9qiYle2hVuMSnvk1fbY4Bxzy_nAZrPHVUOCK2XZEV8u9RAJRzEh80v69fczYXLkEfQa1-Xm_AXKy03obJROgs97weFy--LvEMH-vHzy5pcmqmFGnUHwDqEVMDG34BfeJtLplMyRdSohDJHsh2G18dGy98Tr6Lhhpw6Xe78KgYYrxv88Mc',
    description: {
      en: 'A series of personal writings by Marcus Aurelius, Roman Emperor from 161 to 180 AD, recording his private notes to himself and ideas on Stoic philosophy.',
      'zh-HK': '馬可·奧里略（公元 161 年至 180 年的羅馬皇帝）的一系列個人著作，記錄了他對自己的私人筆記以及關於斯多葛哲學的思想。'
    },
    quantity: 5
  },
  {
    id: '2',
    title: { en: 'One Hundred Years of Solitude', 'zh-HK': '百年孤寂' },
    author: { en: 'Gabriel García Márquez', 'zh-HK': '加布列·賈西亞·馬奎斯' },
    category: 'catModernLiterature',
    cover: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC6xdp6gSCY4xQ_7LVbKgHw1cuRXwuYDbEgmQGVZ-qQVK7YDOLLQyobvvP8X2msPTZaqy4bk8zqYH94TUpAdI0taAiCKO98HZ32j1ZqaZ3U8bXI5WuKzl60QgTfDCY0D5FGvOKEGGz4CoetYSY1-qbirtu9z-4dPOPaio2bgcPSE35nFi_Yn62lJE7nhDKL3PLrX3LM55wwd-O6aLyRaAHEAXgEUP14dN37I1PT6h4h0ktx5IEaL4SCCYoJYZIm6SRtS6bRpomlEro',
    description: {
      en: 'The multi-generational story of the Buendía family, whose patriarch, José Arcadio Buendía, founded the (fictitious) town of Macondo.',
      'zh-HK': '布恩迪亞家族的多代故事，其族長何塞·阿卡迪奧·布恩迪亞創立了（虛構的）馬孔多鎮。'
    },
    quantity: 3
  },
  {
    id: '3',
    title: { en: 'The Moon and Sixpence', 'zh-HK': '月亮與六便士' },
    author: { en: 'W. Somerset Maugham', 'zh-HK': '威廉·薩默塞特·毛姆' },
    category: 'catModernLiterature',
    cover: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsdShNEC9mAJ3q7msqAy4UqysgK2A8kFpsUOVFCU24_CvqPV-Fz3OGG0YSvG9PCPyo8zbbrkZ8oNQkmISYxtwUy4vnuAPfls5k9PGisKFNOMVcL07TqKQ6NFZ_cN4bH_7Z64GCgJ-q_b1M2yF_GeQqUofvwhtEC7Yw5DaQENCCry3HRq3nYgcqs1sysK7GSAKmqQ6YRFNISQPo0iLso-O7VAhZgl5KHycOededSnTD37NS94S6MC7S0cdZW11v5wMzbWncdm6Tfqw',
    description: {
      en: 'A novel by W. Somerset Maugham, first published in 1919. It is told in episodic form by a first-person narrator, in a series of glimpses into the mind and soul of the central character, Charles Strickland.',
      'zh-HK': '威廉·薩默塞特·毛姆的小說，於 1919 年首次出版。它由第一人稱敘述者以插曲形式講述，通過一系列對中心人物查爾斯·斯特里克蘭的思想和靈魂的窺視。'
    },
    quantity: 2
  },
  {
    id: '4',
    title: { en: 'The Great Gatsby', 'zh-HK': '大亨小傳' },
    author: { en: 'F. Scott Fitzgerald', 'zh-HK': '法蘭西斯·史考特·費茲傑羅' },
    category: 'catModernLiterature',
    cover: 'https://picsum.photos/seed/gatsby/400/600',
    description: {
      en: 'A 1925 novel by American writer F. Scott Fitzgerald. Set in the Jazz Age on Long Island, near New York City, the novel depicts first-person narrator Nick Carraway\'s interactions with mysterious millionaire Jay Gatsby.',
      'zh-HK': '美國作家 F. 斯科特·菲茨杰拉德 1925 年的小說。小說背景設定在紐約市附近的長島爵士樂時代，描繪了第一人稱敘述者尼克·卡拉威與神秘百萬富翁傑伊·蓋茨比的互動。'
    },
    quantity: 4
  },
  {
    id: '5',
    title: { en: 'Sapiens', 'zh-HK': '人類大歷史' },
    author: { en: 'Yuval Noah Harari', 'zh-HK': '尤瓦爾·諾亞·哈拉里' },
    category: 'catPhilosophy',
    cover: 'https://picsum.photos/seed/sapiens/400/600',
    description: {
      en: 'A book by Yuval Noah Harari, first published in Hebrew in Israel in 2011 based on a series of lectures Harari taught at The Hebrew University of Jerusalem.',
      'zh-HK': '尤瓦爾·諾亞·哈拉里的一本書，2011 年在以色列首次以希伯來語出版，基於哈拉里在耶路撒冷希伯來大學教授的一系列講座。'
    },
    quantity: 6
  },
  {
    id: '6',
    title: { en: 'Brief Answers to the Big Questions', 'zh-HK': '霍金大問答' },
    author: { en: 'Stephen Hawking', 'zh-HK': '史蒂芬·霍金' },
    category: 'catTechInnovation',
    cover: 'https://picsum.photos/seed/hawking/400/600',
    description: {
      en: 'A popular science book written by physicist Stephen Hawking, and published by Hodder & Stoughton and Bantam Books on 16 October 2018.',
      'zh-HK': '物理學家史蒂芬·霍金撰寫的一本通俗科學書，由 Hodder & Stoughton 和 Bantam Books 於 2018 年 10 月 16 日出版。'
    },
    quantity: 1
  }
];

const EVENTS_DATA: LibraryEvent[] = [
  {
    id: '1',
    title: { en: 'Modern Architecture Symposium', 'zh-HK': '現代建築研討會' },
    date: 'Oct 24, 2023',
    time: '6:00 PM - 8:00 PM',
    location: { en: 'Online (Zoom/Google Meet)', 'zh-HK': '線上進行 (Zoom/Google Meet)' },
    category: 'catArtHistory',
    image: 'https://picsum.photos/seed/arch/800/400',
    agenda: {
      en: [
        '6:00 PM - Opening Keynote: The Bauhaus Legacy',
        '6:45 PM - Panel Discussion: Sustainable Urbanism',
        '7:30 PM - Q&A and Networking Session'
      ],
      'zh-HK': [
        '6:00 PM - 開幕演講：包浩斯的遺產',
        '6:45 PM - 小組討論：可持續城市化',
        '7:30 PM - 問答與交流環節'
      ]
    }
  },
  {
    id: '2',
    title: { en: 'AI & The Future of Literature', 'zh-HK': '人工智能與文學的未來' },
    date: 'Nov 02, 2023',
    time: '2:00 PM - 4:00 PM',
    location: { en: 'Online (Zoom/Google Meet)', 'zh-HK': '線上進行 (Zoom/Google Meet)' },
    category: 'catTechInnovation',
    image: 'https://picsum.photos/seed/ai/800/400',
    agenda: {
      en: [
        '2:00 PM - Introduction to LLMs in Creative Writing',
        '2:30 PM - Live Demo: Co-authoring with AI',
        '3:15 PM - Ethics Workshop: Copyright and Creativity'
      ],
      'zh-HK': [
        '2:00 PM - 創意寫作中的大語言模型簡介',
        '2:30 PM - 現場演示：與 AI 共同創作',
        '3:15 PM - 倫理工作坊：版權與創意'
      ]
    }
  },
  {
    id: '3',
    title: { en: 'Children\'s Storytelling Hour', 'zh-HK': '兒童故事時間' },
    date: 'Every Saturday',
    time: '10:00 AM - 11:00 AM',
    location: { en: 'Online (Zoom/Google Meet)', 'zh-HK': '線上進行 (Zoom/Google Meet)' },
    category: 'catChildrensBooks',
    image: 'https://picsum.photos/seed/kids/800/400',
    agenda: {
      en: [
        '10:00 AM - Welcome Song and Warm-up',
        '10:15 AM - Featured Story: "The Library Lion"',
        '10:45 AM - Interactive Puppet Show'
      ],
      'zh-HK': [
        '10:00 AM - 歡迎與熱身歌曲',
        '10:15 AM - 精選故事：《圖書館獅子》',
        '10:45 AM - 互動木偶劇'
      ]
    }
  }
];

const ACTIVITIES: Activity[] = [
  {
    id: '1',
    type: 'event',
    title: 'Upcoming: Modern Architecture',
    subtitle: 'Oct 24, 6:00 PM • Signed up',
    date: 'Oct 24',
    details: {
      description: 'A deep dive into 21st-century architectural trends and sustainable urban planning.',
      location: 'Main Hall, Level 2',
      time: '6:00 PM - 8:00 PM'
    }
  },
  {
    id: '2',
    type: 'borrow',
    title: 'Borrowing: "The Great Gatsby"',
    subtitle: 'Application submitted • Pending approval',
    date: 'Today',
    details: {
      borrowDate: 'Oct 20, 2023',
      remainingDays: 14,
      progress: 'Pending',
      applicationDate: 'Oct 20, 2023'
    }
  },
  {
    id: '3',
    type: 'renew',
    title: 'Extension: "Sapiens"',
    subtitle: 'Extension request submitted • Pending',
    date: 'Today',
    details: {
      progress: 'Pending',
      applicationDate: 'Oct 20, 2023',
      description: 'Requesting 7 additional days for completion.'
    }
  }
];

const CATEGORIES = [
  'catAll',
  'catModernLiterature',
  'catTechInnovation',
  'catArtHistory',
  'catPhilosophy',
  'catChildrensBooks'
];

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-[70]"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
            {children}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const BottomNav = ({ 
  currentView, 
  setView,
  unreadCount,
  t
}: { 
  currentView: View, 
  setView: (v: View) => void,
  unreadCount: number,
  t: any
}) => {
  const navItems: { id: View, icon: React.ElementType, label: string }[] = [
    { id: 'home', icon: HomeIcon, label: t.home },
    { id: 'bookshelf', icon: Library, label: t.library },
    { id: 'events', icon: Calendar, label: t.bulletin },
    { id: 'profile', icon: User, label: t.profile },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/80 backdrop-blur-lg border-t border-slate-200 px-6 py-3 flex justify-between items-center z-50">
      {navItems.map((item, idx) => (
        <button
          key={`bottom-nav-${item.id}-${idx}`}
          onClick={() => setView(item.id)}
          className={`flex flex-col items-center gap-1 transition-colors relative ${
            currentView === item.id ? 'text-blue-500' : 'text-slate-400'
          }`}
        >
          <item.icon size={24} className={currentView === item.id ? 'fill-current' : ''} />
          <span className="text-xs font-bold">{item.label}</span>
          {item.id === 'events' && unreadCount > 0 && (
            <span className="absolute top-0 right-1 size-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
              {unreadCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
};

// --- Views ---

// --- Views ---

const LanguageSwitcher = ({ language, setLanguage }: { language: Language, setLanguage: (l: Language) => void }) => (
  <div className="absolute top-2 left-4 z-[100] flex bg-white/40 backdrop-blur-md p-0.5 rounded-xl shadow-sm border border-slate-200/30 scale-[0.85] origin-top-left">
    <button 
      onClick={() => setLanguage('en')}
      className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${language === 'en' ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-400 hover:text-slate-600'}`}
    >
      EN
    </button>
    <button 
      onClick={() => setLanguage('zh-HK')}
      className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${language === 'zh-HK' ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-400 hover:text-slate-600'}`}
    >
      繁
    </button>
  </div>
);

const LoginView = ({ 
  onLogin, 
  t, 
  language, 
  setLanguage 
}: { 
  onLogin: () => void, 
  t: any, 
  language: Language, 
  setLanguage: (l: Language) => void,
  key?: string 
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await signInWithPopup(auth, googleProvider);
      onLogin();
    } catch (error) {
      console.error("Google Login failed:", error);
      setError("Google Login failed. Please try again.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLogin();
    } catch (error: any) {
      console.error("Auth failed:", error);
      setError(error.message || "Authentication failed. Please try again.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col min-h-screen bg-slate-50 p-6 justify-center relative"
    >
      <div className="mb-8 text-center">
        <div className="size-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-blue-200">
          <BookOpen size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t.appName}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.loginSubtitle}</p>
      </div>

      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
        <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.email}</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold shadow-lg shadow-slate-200 active:scale-95 transition-all mt-2"
          >
            {isSignUp ? t.signUp : t.signIn}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-slate-500">Or</span>
          </div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          type="button"
          className="w-full h-14 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {t.signInWithGoogle}
        </button>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-sm text-blue-600 font-medium hover:underline"
          >
            {isSignUp ? t.toggleToSignIn : t.toggleToSignUp}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const getRemainingDays = (dueDate?: string | null) => {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const diff = due.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
};

const HomeView = ({ 
  books,
  onProfileClick, 
  onBorrowedClick,
  onExploreClick,
  onBookClick,
  searchQuery, 
  setSearchQuery, 
  selectedCategory, 
  setSelectedCategory,
  onRenewClick,
  onBulletinClick,
  borrowedBooks,
  selectedRenewBooks,
  setSelectedRenewBooks,
  unreadCount,
  language,
  t,
  userDisplayName
}: { 
  books: Book[],
  onProfileClick: () => void, 
  onBorrowedClick: () => void,
  onExploreClick: () => void,
  onBookClick: (book: Book) => void,
  onBulletinClick: () => void,
  searchQuery: string,
  setSearchQuery: (q: string) => void,
  selectedCategory: string,
  setSelectedCategory: (c: string) => void,
  onRenewClick: () => void,
  borrowedBooks: (Book & { dueDate?: string })[],
  selectedRenewBooks: string[],
  setSelectedRenewBooks: React.Dispatch<React.SetStateAction<string[]>>,
  unreadCount: number,
  language: Language,
  t: any,
  userDisplayName: string,
  key?: string
}) => {
  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      const matchesSearch = renderTranslatable(book.title, language).toLowerCase().includes(searchQuery.toLowerCase()) || 
                           renderTranslatable(book.author, language).toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'catAll' || book.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, language]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col pb-24"
    >
      {/* Header */}
      <div className="flex items-center p-6 pt-10 pb-2 justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onProfileClick}>
          <div className="size-12 rounded-full overflow-hidden border-2 border-blue-100">
            <img 
              className="size-full object-cover" 
              src={auth.currentUser?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=library"} 
              alt="User Avatar"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <p className="text-xs text-slate-400">{t.hello}</p>
            <h2 className="text-xl font-bold text-slate-800">{userDisplayName || t.userName}, {t.welcomeBack}</h2>
          </div>
        </div>
        <button 
          onClick={onBulletinClick}
          className="size-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 border border-slate-100 active:scale-95 transition-transform relative"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2.5 size-2 bg-red-500 rounded-full border border-white" />
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-6 py-4">
        <div className="flex w-full items-center rounded-xl h-14 bg-white shadow-md border-none px-4 group">
          <Search className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-900 placeholder:text-slate-400 px-3 text-sm" 
            placeholder={t.search}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1">
              <X size={16} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-3 gap-3 p-6">
        {[
          { icon: BadgeCheck, label: t.profile, color: 'bg-blue-50 text-blue-600', action: onProfileClick },
          { icon: SearchCode, label: t.explore, color: 'bg-teal-50 text-teal-600', action: onExploreClick },
          { icon: BookOpen, label: t.borrowed, color: 'bg-yellow-50 text-yellow-600', action: onBorrowedClick },
        ].map((item, i) => (
          <button key={`home-quick-${i}`} onClick={item.action} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
            <div className={`size-14 rounded-2xl flex items-center justify-center ${item.color}`}>
              <item.icon size={24} />
            </div>
            <span className="text-xs font-medium text-slate-700">{item.label}</span>
          </button>
        ))}
      </div>

      {/* New Arrivals Section */}
      <div className="px-6 py-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {searchQuery ? `${t.search} (${filteredBooks.length})` : t.recommendations}
          </h3>
          {!searchQuery && filteredBooks.length > 0 && (
            <button 
              onClick={onExploreClick}
              className="text-orange-600 text-sm font-bold"
            >
              {t.viewAll}
            </button>
          )}
        </div>

        {/* Integrated Category Filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`home-category-filter-${cat}-${idx}`}
                onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                selectedCategory === cat 
                ? 'bg-blue-500 text-white shadow-md shadow-blue-200' 
                : 'bg-white text-slate-500 border border-slate-100'
              }`}
            >
              {t[cat as keyof typeof t] || cat}
            </button>
          ))}
        </div>

        <div className="flex gap-6 overflow-x-auto pb-4 no-scrollbar">
          {filteredBooks.length > 0 ? (
            filteredBooks.map((book, idx) => (
              <div 
                key={`home-recommend-book-${book.id}-${idx}`} 
                className="flex-shrink-0 w-40 cursor-pointer active:scale-95 transition-transform"
                onClick={() => onBookClick(book)}
              >
                <div className="aspect-[2/3] w-full rounded-xl bg-white shadow-lg mb-3 overflow-hidden">
                  <img 
                    className="w-full h-full object-cover" 
                    src={book.cover} 
                    alt={renderTranslatable(book.title, language)}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{renderTranslatable(book.title, language)}</h4>
                <p className="text-xs text-slate-400">{renderTranslatable(book.author, language)}</p>
              </div>
            ))
          ) : (
            <div className="w-full py-10 text-center text-slate-400 italic">{t.noBooksFound}</div>
          )}
        </div>
      </div>

      {/* Status Card */}
      <div className="px-6 py-4">
        <div className="relative bg-gradient-to-br from-blue-500 to-orange-500 rounded-2xl p-6 text-white overflow-hidden shadow-lg">
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-2">{t.borrowing}</h3>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm opacity-90">{t.borrowed}: {borrowedBooks.length}</p>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedRenewBooks.length === borrowedBooks.length) {
                    setSelectedRenewBooks([]);
                  } else {
                    setSelectedRenewBooks(borrowedBooks.map(b => b.id));
                  }
                }}
                className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-lg border border-white/30 active:scale-95 transition-transform"
              >
                {selectedRenewBooks.length === borrowedBooks.length ? t.deselectAll : t.selectAll}
              </button>
            </div>
            
            <div className="space-y-2 mb-6">
              {borrowedBooks.map((book, idx) => (
                <div 
                  key={`renew-select-${book.id}-${idx}`}
                  onClick={() => {
                    setSelectedRenewBooks(prev => 
                      prev.includes(book.id) 
                      ? prev.filter(id => id !== book.id) 
                      : [...prev, book.id]
                    );
                  }}
                  className={`flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer ${
                    selectedRenewBooks.includes(book.id)
                    ? 'bg-white/20 border border-white/30'
                    : 'bg-transparent border border-transparent'
                  }`}
                >
                  <div className={`size-5 rounded-md border flex items-center justify-center transition-colors ${
                    selectedRenewBooks.includes(book.id)
                    ? 'bg-white border-white text-orange-600'
                    : 'bg-transparent border-white/50'
                  }`}>
                    {selectedRenewBooks.includes(book.id) && <CheckCircle2 size={12} strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{renderTranslatable(book.title, language)}</p>
                    <p className="text-[10px] opacity-70">
                      {book.dueDate 
                        ? t.dueIn.replace('{days}', getRemainingDays(book.dueDate)?.toString() || '0')
                        : t.waitingForDelivery}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={onRenewClick}
              disabled={selectedRenewBooks.length === 0}
              className={`w-full py-3 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all ${
                selectedRenewBooks.length === 0
                ? 'bg-white/30 text-white/50 cursor-not-allowed'
                : 'bg-white text-orange-600'
              }`}
            >
              {t.renew} ({selectedRenewBooks.length})
            </button>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <BookOpen size={120} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const LibraryView = ({ 
  books,
  borrowed, 
  onBookClick, 
  onBorrow,
  onReturn,
  activeTab, 
  setActiveTab,
  language,
  t
}: { 
  books: Book[],
  borrowed: (Book & { dueDate?: string })[], 
  onBookClick: (book: Book) => void, 
  onBorrow: (book: Book) => void,
  onReturn: (book: Book) => void,
  activeTab: 'all' | 'borrowed',
  setActiveTab: (t: 'all' | 'borrowed') => void,
  language: Language,
  t: any,
  key?: string 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('catAll');
  const [sortBy, setSortBy] = useState<'title' | 'author'>('title');
  
  const filteredBooks = useMemo(() => {
    const baseList = activeTab === 'all' ? books : borrowed;
    return baseList
      .filter(book => {
        const matchesSearch = renderTranslatable(book.title, language).toLowerCase().includes(searchQuery.toLowerCase()) || 
                             renderTranslatable(book.author, language).toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'catAll' || book.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return renderTranslatable(a.title, language).localeCompare(renderTranslatable(b.title, language));
        return renderTranslatable(a.author, language).localeCompare(renderTranslatable(b.author, language));
      });
  }, [activeTab, searchQuery, selectedCategory, sortBy, borrowed, language]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col pb-24 min-h-screen bg-slate-50"
    >
      <header className="p-6 pt-8 bg-white border-b border-slate-100 sticky top-0 z-20">
        <h1 className="text-2xl font-bold text-slate-900">{t.libraryCollection}</h1>
        <div className="flex gap-4 mt-4">
          <button 
            onClick={() => setActiveTab('all')}
            className={`text-sm font-bold pb-2 border-b-2 transition-colors ${activeTab === 'all' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400'}`}
          >
            {t.allBooks}
          </button>
          <button 
            onClick={() => setActiveTab('borrowed')}
            className={`text-sm font-bold pb-2 border-b-2 transition-colors ${activeTab === 'borrowed' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400'}`}
          >
            {t.myBooks} ({borrowed.length})
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>
            <button 
              onClick={() => setSortBy(sortBy === 'title' ? 'author' : 'title')}
              className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-600 flex items-center gap-2 text-xs font-bold active:scale-95 transition-all"
            >
              <ArrowUpDown size={14} />
              {sortBy === 'title' ? t.title : t.author}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`library-category-tab-${cat}-${idx}`}
                onClick={() => setSelectedCategory(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  selectedCategory === cat 
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-200' 
                  : 'bg-white text-slate-500 border border-slate-100'
                }`}
              >
                {t[cat as keyof typeof t] || cat}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="p-6 space-y-4">
        {filteredBooks.length > 0 ? (
          filteredBooks.map((book, idx) => (
            <div 
              key={`library-collection-book-${book.id}-${idx}`} 
              className="flex gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 cursor-pointer active:scale-[0.98] transition-all"
              onClick={() => onBookClick(book)}
            >
              <div className="w-20 h-28 rounded-lg overflow-hidden flex-shrink-0 shadow-md">
                <img src={book.cover} alt={renderTranslatable(book.title, language)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col justify-between py-1 flex-1">
                <div>
                  <h3 className="font-bold text-slate-900">{renderTranslatable(book.title, language)}</h3>
                  <p className="text-xs text-slate-500">{renderTranslatable(book.author, language)}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-md">
                    {t[book.category as keyof typeof t] || book.category}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  {borrowed.find(b => b.id === book.id) ? (
                    <div className="flex items-center gap-1 text-orange-500 text-[10px] font-bold">
                      <Clock size={12} />
                      <span>
                        {borrowed.find(b => b.id === book.id)?.dueDate 
                          ? t.dueIn.replace('{days}', getRemainingDays(borrowed.find(b => b.id === book.id)?.dueDate)?.toString() || '0')
                          : t.waitingForDelivery}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold">
                      <CheckCircle2 size={12} />
                      <span>{t.available}</span>
                    </div>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (borrowed.some(b => b.id === book.id)) {
                        onBorrow(book); // This will trigger renew logic in the handler
                      } else {
                        onBorrow(book);
                      }
                    }}
                    className="text-blue-500 text-xs font-bold"
                  >
                    {borrowed.some(b => b.id === book.id) ? t.renew : t.borrow}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center text-slate-400 italic text-sm">
            {t.noRequests}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const BulletinView = ({ 
  notifications, 
  setNotifications,
  events,
  t,
  language
}: { 
  notifications: Notification[], 
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>,
  events: any[],
  t: any,
  language: Language,
  key?: string
}) => {
  const [activeTab, setActiveTab] = useState<'news' | 'notifications'>('news');
  const [selectedEvent, setSelectedEvent] = useState<LibraryEvent | null>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col pb-24 min-h-screen bg-slate-50"
    >
      <header className="p-6 pt-10 bg-white border-b border-slate-100 sticky top-0 z-20">
        <h1 className="text-2xl font-bold text-slate-900">{t.bulletin}</h1>
        <div className="flex gap-4 mt-4">
          <button 
            onClick={() => setActiveTab('news')}
            className={`text-sm font-bold pb-2 border-b-2 transition-colors ${activeTab === 'news' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400'}`}
          >
            {t.explore}
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`text-sm font-bold pb-2 border-b-2 transition-colors relative ${activeTab === 'notifications' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400'}`}
          >
            {t.recentActivity}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-2 size-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="p-6">
        {activeTab === 'news' ? (
          <div className="space-y-6">
            {events.map((event, idx) => (
              <div 
                key={`bulletin-event-${event.id}-${idx}`} 
                onClick={() => setSelectedEvent(event)}
                className="bg-white rounded-3xl overflow-hidden shadow-md border border-slate-100 active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className="h-40 w-full relative">
                  <img src={event.image || 'https://via.placeholder.com/400x200'} alt={event.title?.en || event.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-bold text-blue-500">
                    {t[event.category as keyof typeof t] || event.category}
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{event.title?.[language] || event.title?.en || event.title}</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <Calendar size={14} className="text-blue-500" />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <Clock size={14} className="text-blue-500" />
                      <span>{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <MapPin size={14} className="text-blue-500" />
                      <span>{event.location?.[language] || event.location?.en || event.location}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-blue-500 font-bold text-xs">
                    <span>{t.viewSchedule}</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="py-20 text-center text-slate-400 italic text-sm">
                No events found.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.recentUpdates}</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-xs font-bold text-blue-500 hover:underline"
                >
                  {t.markAllRead}
                </button>
              )}
            </div>
            
            {notifications.length > 0 ? (
              notifications.map((notif, idx) => (
                <div 
                  key={`bulletin-notif-${notif.id}-${idx}`}
                  onClick={() => markAsRead(notif.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer active:scale-[0.99] ${
                    notif.isRead ? 'bg-white border-slate-100' : 'bg-blue-50/50 border-blue-100 ring-1 ring-blue-100'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className={`text-sm font-bold ${notif.isRead ? 'text-slate-900' : 'text-blue-900'}`}>
                      {renderTranslatable(notif.title, language)}
                    </h4>
                    {!notif.isRead && <div className="size-2 rounded-full bg-blue-500 mt-1.5" />}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">{renderTranslatable(notif.message, language)}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock size={12} />
                    <span>{notif.date}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="size-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                  <Bell size={32} />
                </div>
                <p className="text-slate-400 text-sm italic">{t.noNotifications}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal 
        isOpen={!!selectedEvent} 
        onClose={() => setSelectedEvent(null)} 
        title={t.eventSchedule}
      >
        {selectedEvent && (
          <div className="py-4">
            <div className="mb-6">
              <h4 className="text-lg font-bold text-slate-900 mb-1">{selectedEvent.title[language]}</h4>
              <p className="text-xs text-slate-500">{selectedEvent.date} • {selectedEvent.location[language]}</p>
            </div>
            
            <div className="space-y-4">
              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.agenda}</h5>
              <div className="space-y-3">
                {selectedEvent.agenda?.[language].map((item, i) => (
                  <div key={`bulletin-agenda-${selectedEvent.id}-${i}`} className="flex gap-3 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <p className="text-sm text-slate-700 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <button 
              onClick={() => setSelectedEvent(null)}
              className="w-full mt-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm"
            >
              {t.close}
            </button>
          </div>
        )}
      </Modal>
    </motion.div>
  );
};

const BookDetailView = ({ 
  book, 
  onBack, 
  onBorrow, 
  onReturn,
  isBorrowed,
  t,
  language
}: { 
  book: Book, 
  onBack: () => void, 
  onBorrow: () => void, 
  onReturn: () => void,
  isBorrowed: boolean,
  t: any,
  language: Language,
  key?: string 
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col pb-24 min-h-screen bg-white"
    >
      <header className="flex items-center justify-between p-6 pt-10">
        <button 
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-600"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold tracking-tight">{t.title}</h1>
        <div className="w-10" />
      </header>

      <div className="px-6 py-4 flex flex-col items-center">
        <div className="w-48 aspect-[2/3] rounded-2xl shadow-2xl overflow-hidden mb-8">
          <img src={book.cover} alt={renderTranslatable(book.title, language)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{renderTranslatable(book.title, language)}</h2>
          <p className="text-slate-500 font-medium mb-4">{renderTranslatable(book.author, language)}</p>
          <div className="flex items-center justify-center gap-2">
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full">
              {t[book.category as keyof typeof t] || book.category}
            </span>
            {isBorrowed ? (
              <span className="px-3 py-1 bg-orange-50 text-orange-600 text-xs font-bold rounded-full">{t.borrowed}</span>
            ) : (
              <span className="px-3 py-1 bg-green-50 text-green-600 text-xs font-bold rounded-full">{t.available}</span>
            )}
          </div>
        </div>

        <div className="w-full space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">{t.explore}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {book.description[language] || book.description.en}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 py-6 border-y border-slate-100">
            <div className="text-center">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">{t.pages}</p>
              <p className="text-sm font-bold text-slate-900">320</p>
            </div>
            <div className="text-center border-x border-slate-100">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">{t.language}</p>
              <p className="text-sm font-bold text-slate-900">{language === 'en' ? 'English' : '繁體中文'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">{t.rating}</p>
              <div className="flex items-center justify-center gap-1">
                <Star size={12} className="text-yellow-400 fill-yellow-400" />
                <p className="text-sm font-bold text-slate-900">4.8</p>
              </div>
            </div>
          </div>

          <button 
            onClick={onBorrow}
            className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 active:scale-95 transition-transform"
          >
            {isBorrowed ? t.renew : t.borrow}
          </button>

          {isBorrowed && (
            <button 
              onClick={onReturn}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95 transition-transform mt-2"
            >
              {t.return}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ProfileView = ({ 
  onBack, 
  onShowQr, 
  onLogout,
  onViewTracking,
  borrowedBooks,
  addresses,
  setAddresses,
  requests,
  language,
  setLanguage,
  t,
  showToast,
  showConfirm,
  setModalMode,
  setBookName,
  setLockBookName,
  setIsBorrowModalOpen,
  userDisplayName,
  setUserDisplayName
}: { 
  onBack: () => void, 
  onShowQr: () => void, 
  onLogout: () => void,
  onViewTracking: () => void,
  borrowedBooks: (Book & { dueDate?: string })[],
  addresses: ShippingAddress[],
  setAddresses: React.Dispatch<React.SetStateAction<ShippingAddress[]>>,
  requests: Request[],
  language: Language,
  setLanguage: (l: Language) => void,
  t: any,
  showToast: (m: string, type?: ToastType) => void,
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'primary' | 'danger') => void,
  setModalMode: (m: 'borrow' | 'return') => void,
  setBookName: (n: string) => void,
  setLockBookName: (l: boolean) => void,
  setIsBorrowModalOpen: (o: boolean) => void,
  userDisplayName: string,
  setUserDisplayName: (name: string) => void,
  key?: string 
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [activeStatModal, setActiveStatModal] = useState<'borrowed' | 'returned' | 'overdue' | null>(null);
  const [selectedBenefit, setSelectedBenefit] = useState<{ icon: React.ElementType, label: string, description: string, color: string } | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(userDisplayName);

  useEffect(() => {
    if (isEditProfileOpen) {
      setEditDisplayName(userDisplayName);
    }
  }, [isEditProfileOpen, userDisplayName]);

  const dynamicActivities = useMemo(() => {
    const activities: Activity[] = [];
    
    // 1. Add upcoming events (Online library activities)
    EVENTS_DATA.forEach(event => {
      activities.push({
        id: `event-${event.id}`,
        type: 'event',
        title: `${t.upcoming}: ${event.title[language]}`,
        subtitle: `${event.date}, ${event.time}`,
        date: event.date,
        details: {
          description: `Join us for the ${event.title[language]} in the ${event.location[language]}.`,
          location: event.location[language],
          time: event.time
        }
      });
    });

    // 2. Add books currently borrowed
    borrowedBooks.forEach(book => {
      activities.push({
        id: `borrow-${book.id}`,
        type: 'borrow',
        title: `${t.borrowed}: "${renderTranslatable(book.title, language)}"`,
        subtitle: book.dueDate 
          ? t.dueIn.replace('{days}', getRemainingDays(book.dueDate)?.toString() || '0')
          : t.waitingForDelivery,
        date: 'Recent',
        details: {
          borrowDate: 'Mar 01, 2026', // Mocked
          remainingDays: getRemainingDays(book.dueDate),
          progress: 'Approved'
        }
      });
    });

    return activities;
  }, [borrowedBooks, language, t]);

  const returnedActivities = ACTIVITIES.filter(a => a.type === 'return');
  const overdueBooks: Book[] = []; // Mocking overdue as empty for now

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    try {
      await updateProfile(auth.currentUser, {
        displayName: editDisplayName
      });
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        name: editDisplayName
      });
      setUserDisplayName(editDisplayName);
      showToast(t.profileUpdated || 'Profile updated successfully', 'success');
      setIsEditProfileOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Error updating profile', 'error');
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (oldPassword && newPassword) {
      showToast(t.processed);
      setIsChangePasswordOpen(false);
      setOldPassword('');
      setNewPassword('');
    } else {
      showToast(t.loading, 'info');
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const isDefault = formData.get('isDefault') === 'on';
    
    try {
      if (isDefault) {
        // Update other addresses to not be default
        const batch = addresses.map(async (a) => {
          if (a.isDefault) {
            await updateDoc(doc(db, `users/${auth.currentUser!.uid}/addresses`, a.id), { isDefault: false });
          }
        });
        await Promise.all(batch);
      }

      if (editingAddress) {
        const addrRef = doc(db, `users/${auth.currentUser!.uid}/addresses`, editingAddress.id);
        await updateDoc(addrRef, {
          recipientName: formData.get('recipientName') as string,
          phoneNumber: formData.get('phoneNumber') as string,
          detailedAddress: formData.get('detailedAddress') as string,
          isDefault,
        });
      } else {
        const newAddrRef = doc(collection(db, `users/${auth.currentUser!.uid}/addresses`));
        await setDoc(newAddrRef, {
          id: newAddrRef.id,
          userId: auth.currentUser!.uid,
          recipientName: formData.get('recipientName') as string,
          phoneNumber: formData.get('phoneNumber') as string,
          detailedAddress: formData.get('detailedAddress') as string,
          isDefault,
          createdAt: serverTimestamp()
        });
      }
      setIsEditFormOpen(false);
      setEditingAddress(null);
    } catch (err) {
      handleFirestoreError(err, editingAddress ? OperationType.UPDATE : OperationType.CREATE, `users/${auth.currentUser!.uid}/addresses`);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    showConfirm(t.delete, t.confirm, async () => {
      try {
        await deleteDoc(doc(db, `users/${auth.currentUser!.uid}/addresses`, id));
        showToast(t.processed);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${auth.currentUser!.uid}/addresses/${id}`);
      }
    }, 'danger');
  };

  const handleSetDefault = async (id: string) => {
    try {
      const batch = addresses.map(async (a) => {
        if (a.isDefault && a.id !== id) {
          await updateDoc(doc(db, `users/${auth.currentUser!.uid}/addresses`, a.id), { isDefault: false });
        } else if (a.id === id && !a.isDefault) {
          await updateDoc(doc(db, `users/${auth.currentUser!.uid}/addresses`, a.id), { isDefault: true });
        }
      });
      await Promise.all(batch);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser!.uid}/addresses`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col pb-24 min-h-screen bg-gradient-to-b from-blue-50 to-white relative"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-6 pt-10 relative z-20">
        <button 
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-600"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold tracking-tight">{t.membership}</h1>
        <div className="relative">
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-600 transition-colors ${isSettingsOpen ? 'bg-slate-100' : ''}`}
          >
            <Settings size={20} />
          </button>
          
          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 overflow-hidden"
              >
                <button 
                  onClick={() => {
                    setIsEditProfileOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <User size={16} className="text-slate-400" />
                  {t.editProfile}
                </button>
                <div className="h-px bg-slate-50 my-1 mx-2" />
                <button 
                  onClick={() => {
                    setIsChangePasswordOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <Lock size={16} className="text-slate-400" />
                  {t.changePassword}
                </button>
                <div className="h-px bg-slate-50 my-1 mx-2" />
                <button 
                  onClick={() => {
                    setIsAddressModalOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <MapPin size={16} className="text-slate-400" />
                  {t.shippingAddress}
                </button>
                <div className="h-px bg-slate-50 my-1 mx-2" />
                <button 
                  onClick={() => {
                    setIsWarehouseModalOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <Building2 size={16} className="text-slate-400" />
                  {t.warehouseAddress}
                </button>
                <div className="h-px bg-slate-50 my-1 mx-2" />
                <button 
                  onClick={() => {
                    onLogout();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <LogOut size={16} />
                  {t.logout}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Overlay to close settings */}
      {isSettingsOpen && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Profile Section */}
      <section className="px-6 py-8 flex flex-col items-center text-center">
        <button 
          onClick={onViewTracking}
          className="relative mb-6 group active:scale-95 transition-transform"
        >
          {/* Circular Progress Border */}
          <div 
            className="absolute inset-[-8px] rounded-full border-[3px] border-blue-400 transition-all duration-1000" 
            style={{ opacity: requests.filter(r => r.status === 'approved' && r.trackingStatus).length > 0 ? 1 : 0.3 }}
          />
          
          <div className="w-28 h-28 rounded-full p-1.5 bg-white shadow-lg relative z-10 group-hover:shadow-blue-100 transition-shadow">
            <img 
              alt={t.profile} 
              className="w-full h-full object-cover rounded-full bg-slate-50" 
              src={auth.currentUser?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=library"}
              referrerPolicy="no-referrer"
            />
          </div>
        </button>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{userDisplayName || t.userName}</h2>
        <div className="mt-3 px-5 py-1.5 bg-blue-50/80 backdrop-blur-sm text-blue-600 rounded-full text-[11px] font-bold tracking-wider border border-blue-100/50">
          ID: 8842-9901
        </div>
      </section>

      {/* Digital Library Pass Card */}
      <section className="px-6 py-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-200 to-blue-400 p-8 text-blue-900 shadow-xl shadow-blue-200/50">
          <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-white/20 rounded-full blur-3xl"></div>
          <div className="relative flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-blue-900/60 uppercase tracking-widest mb-1">{t.membership}</p>
              <h3 className="text-2xl font-bold">{t.digitalPass}</h3>
            </div>
            <div className="bg-white/80 p-2 rounded-xl">
              <QrCode size={24} className="text-blue-500" />
            </div>
          </div>
          <div className="mt-12 flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-blue-900/60 uppercase tracking-widest">No. 8842 9901</p>
              <p className="text-xs font-bold uppercase tracking-widest">{t.libraryName}</p>
            </div>
            <button 
              onClick={onShowQr}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl active:scale-95 transition-transform"
            >
              {t.showQr}
            </button>
          </div>
        </div>
      </section>

      {/* Tracking Status Section */}
      {requests.filter(r => (r.status === 'pending' || (r.status === 'approved' && r.trackingStatus))).length > 0 && (
        <section className="px-6 py-6">
          <button 
            onClick={onViewTracking}
            className="w-full bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                <Scan size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900">{t.trackingStatus}</h3>
                <p className="text-xs text-slate-400">
                  {requests.filter(r => (r.status === 'pending' || (r.status === 'approved' && r.trackingStatus && r.trackingStatus !== 'delivered'))).length} {t.activeTasks}
                </p>
              </div>
            </div>
            <div className="size-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-blue-500 group-hover:bg-blue-50 transition-colors">
              <ChevronRight size={20} />
            </div>
          </button>
        </section>
      )}

      {/* Activity Stats */}
      <section className="px-6 grid grid-cols-3 gap-3">
        {[
          { id: 'borrowed', label: t.borrowed, value: borrowedBooks.length.toString().padStart(2, '0'), color: 'text-blue-500' },
          { id: 'returned', label: t.returned, value: returnedActivities.length.toString().padStart(2, '0'), color: 'text-slate-900' },
          { id: 'overdue', label: t.overdue, value: overdueBooks.length.toString().padStart(2, '0'), color: 'text-red-500' },
        ].map((stat, idx) => (
          <button 
            key={`profile-stat-${stat.id}-${idx}`} 
            onClick={() => setActiveStatModal(stat.id as any)}
            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-left active:scale-95 transition-transform"
          >
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </button>
        ))}
      </section>

      {/* Stat Detail Modal */}
      <Modal 
        isOpen={!!activeStatModal} 
        onClose={() => setActiveStatModal(null)} 
        title={
          activeStatModal === 'borrowed' ? t.borrowed : 
          activeStatModal === 'returned' ? t.returned : 
          t.overdue
        }
      >
        <div className="py-4 space-y-4">
          {activeStatModal === 'borrowed' && (
            borrowedBooks.length > 0 ? (
              borrowedBooks.map((book, idx) => (
                <div key={`stat-borrowed-${book.id}-${idx}`} className="flex gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <img src={book.cover} className="w-12 h-16 object-cover rounded-lg shadow-sm" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 truncate">{renderTranslatable(book.title, language)}</h4>
                    <p className="text-xs text-slate-500 truncate">{renderTranslatable(book.author, language)}</p>
                    <p className="text-[10px] text-blue-500 font-bold mt-1 uppercase tracking-wider">
                      {book.dueDate 
                        ? t.dueIn.replace('{days}', getRemainingDays(book.dueDate)?.toString() || '0')
                        : t.waitingForDelivery}
                    </p>
                  </div>
                  {book.dueDate && (
                    <button
                      onClick={() => {
                        setModalMode('return');
                        setBookName(renderTranslatable(book.title, language));
                        setLockBookName(true);
                        setIsBorrowModalOpen(true);
                        setActiveStatModal(null);
                      }}
                      className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-colors self-center"
                    >
                      {t.return}
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 italic text-sm">{t.noRequests}</div>
            )
          )}

          {activeStatModal === 'returned' && (
            returnedActivities.length > 0 ? (
              returnedActivities.map((activity, idx) => (
                <div key={`stat-returned-${activity.id}-${idx}`} className="flex gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-12 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                    <History size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 truncate">{renderTranslatable(activity.title, language)}</h4>
                    <p className="text-xs text-slate-500 truncate">{renderTranslatable(activity.subtitle, language)}</p>
                    <p className="text-[10px] text-green-500 font-bold mt-1 uppercase tracking-wider">{t.completed}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 italic text-sm">{t.noReturnedBooks}</div>
            )
          )}

          {activeStatModal === 'overdue' && (
            overdueBooks.length > 0 ? (
              overdueBooks.map((book, idx) => (
                <div key={`stat-overdue-${book.id}-${idx}`} className="flex gap-4 p-3 rounded-2xl bg-red-50 border border-red-100">
                  <img src={book.cover} className="w-12 h-16 object-cover rounded-lg shadow-sm" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-red-900 truncate">{renderTranslatable(book.title, language)}</h4>
                    <p className="text-xs text-red-500 truncate">{renderTranslatable(book.author, language)}</p>
                    <p className="text-[10px] text-red-600 font-bold mt-1 uppercase tracking-wider">{t.overdueBy.replace('{days}', '2')}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 italic text-sm">{t.noOverdueBooks}</div>
            )
          )}
        </div>
      </Modal>

      {/* Member Benefits */}
      <section className="mt-8">
        <div className="px-6 flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">{t.memberBenefits}</h3>
        </div>
        <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
          {[
            { icon: BookOpen, label: t.unlimited, description: t.unlimitedDesc, color: 'bg-blue-50 text-blue-500' },
            { icon: Star, label: t.vipActivities, description: t.vipActivitiesDesc, color: 'bg-yellow-50 text-yellow-500' },
            { icon: CalendarCheck, label: t.priority, description: t.priorityDesc, color: 'bg-purple-50 text-purple-500' },
          ].map((benefit, i) => (
            <button 
              key={`profile-benefit-${i}`} 
              onClick={() => setSelectedBenefit(benefit)}
              className="flex-shrink-0 w-32 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${benefit.color}`}>
                <benefit.icon size={24} />
              </div>
              <h4 className="text-xs font-bold text-slate-700">{benefit.label}</h4>
            </button>
          ))}
        </div>
      </section>

      {/* Benefit Detail Modal */}
      <Modal 
        isOpen={!!selectedBenefit} 
        onClose={() => setSelectedBenefit(null)} 
        title={t.memberBenefits}
      >
        {selectedBenefit && (
          <div className="py-6 flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${selectedBenefit.color} shadow-lg shadow-current/10`}>
              <selectedBenefit.icon size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{selectedBenefit.label}</h3>
            <p className="text-slate-500 text-sm leading-relaxed px-4">
              {selectedBenefit.description}
            </p>
            <button 
              onClick={() => setSelectedBenefit(null)}
              className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            >
              {t.confirm}
            </button>
          </div>
        )}
      </Modal>

      {/* Language Switcher in Settings or Profile */}
      {/* Recent Activity */}
      <section className="mt-4 px-6 mb-8">
        <h3 className="text-lg font-bold mb-4 text-slate-900">{t.recentActivity}</h3>
        <div className="space-y-3">
          {dynamicActivities.map((activity, idx) => (
            <button 
              key={`dynamic-act-${activity.id}-${idx}`} 
              onClick={() => setSelectedActivity(activity)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm active:scale-[0.98] transition-transform text-left"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activity.type === 'borrow' ? 'bg-blue-50 text-blue-500' : 
                activity.type === 'event' ? 'bg-yellow-50 text-yellow-600' : 
                activity.type === 'renew' ? 'bg-purple-50 text-purple-500' :
                'bg-slate-50 text-slate-500'
              }`}>
                {activity.type === 'borrow' && <BookOpen size={20} />}
                {activity.type === 'event' && <Calendar size={20} />}
                {activity.type === 'return' && <History size={20} />}
                {activity.type === 'renew' && <RotateCcw size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-900 truncate">{renderTranslatable(activity.title, language)}</p>
                <p className="text-[11px] text-slate-500 truncate">{renderTranslatable(activity.subtitle, language)}</p>
              </div>
              {activity.points ? (
                <span className="text-blue-500 font-bold text-xs flex-shrink-0">{activity.points}</span>
              ) : (
                <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Activity Detail Modal */}
      <Modal 
        isOpen={!!selectedActivity} 
        onClose={() => setSelectedActivity(null)} 
        title={
          selectedActivity?.type === 'event' ? t.activityDetails :
          selectedActivity?.type === 'borrow' ? t.borrowingDetails :
          selectedActivity?.type === 'renew' ? t.extensionProgress :
          t.activityDetails
        }
      >
        {selectedActivity && (
          <div className="py-4 space-y-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                selectedActivity.type === 'borrow' ? 'bg-blue-50 text-blue-500' : 
                selectedActivity.type === 'event' ? 'bg-yellow-50 text-yellow-600' : 
                selectedActivity.type === 'renew' ? 'bg-purple-50 text-purple-500' :
                'bg-slate-50 text-slate-500'
              }`}>
                {selectedActivity.type === 'borrow' && <BookOpen size={28} />}
                {selectedActivity.type === 'event' && <Calendar size={28} />}
                {selectedActivity.type === 'return' && <History size={28} />}
                {selectedActivity.type === 'renew' && <RotateCcw size={28} />}
              </div>
              <div>
                <h4 className="font-bold text-slate-900">{renderTranslatable(selectedActivity.title, language)}</h4>
                <p className="text-xs text-slate-500">{renderTranslatable(selectedActivity.subtitle, language)}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              {selectedActivity.type === 'event' && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.time}</span>
                    <span className="font-bold text-slate-900">{selectedActivity.details?.time}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.location}</span>
                    <span className="font-bold text-slate-900">{selectedActivity.details?.location}</span>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">{t.description}</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedActivity.details?.description}</p>
                  </div>
                </>
              )}

              {selectedActivity.type === 'borrow' && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.borrowDate}</span>
                    <span className="font-bold text-slate-900">{selectedActivity.details?.borrowDate}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.remainingDays}</span>
                    <span className="font-bold text-blue-500">{selectedActivity.details?.remainingDays} {t.days}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.status}</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-[10px] font-bold uppercase">
                      {selectedActivity.details?.progress === 'Approved' ? t.approved : 
                       selectedActivity.details?.progress === 'Pending' ? t.pending :
                       selectedActivity.details?.progress === 'Rejected' ? t.rejected :
                       selectedActivity.details?.progress}
                    </span>
                  </div>
                </>
              )}

              {selectedActivity.type === 'renew' && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.requestDate}</span>
                    <span className="font-bold text-slate-900">{selectedActivity.details?.applicationDate}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">{t.progress}</span>
                    <span className="px-2 py-1 bg-purple-100 text-purple-600 rounded text-[10px] font-bold uppercase">
                      {selectedActivity.details?.progress === 'Approved' ? t.approved : 
                       selectedActivity.details?.progress === 'Pending' ? t.pending :
                       selectedActivity.details?.progress === 'Rejected' ? t.rejected :
                       selectedActivity.details?.progress}
                    </span>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">{t.requestNote}</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedActivity.details?.description}</p>
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={() => setSelectedActivity(null)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            >
              {t.close}
            </button>
          </div>
        )}
      </Modal>

      {/* Warehouse Address Modal */}
      <Modal 
        isOpen={isWarehouseModalOpen} 
        onClose={() => setIsWarehouseModalOpen(false)} 
        title={t.warehouseAddress}
      >
        <div className="py-6 space-y-6">
          <div className="p-6 rounded-3xl bg-blue-50 border border-blue-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-2xl bg-white flex items-center justify-center text-blue-500 shadow-sm">
                <Building2 size={24} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">{t.warehouseName}</h4>
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{t.warehouseAddress}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <MapPin size={16} className="text-slate-400 mt-1 shrink-0" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  456 Return Lane, Book City, BC 67890
                </p>
              </div>
              <div className="flex gap-3">
                <Phone size={16} className="text-slate-400 mt-1 shrink-0" />
                <p className="text-sm text-slate-600">987-654-3210</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 leading-relaxed italic">
              {t.warehouseAddressDesc}
            </p>
          </div>

          <button 
            onClick={() => setIsWarehouseModalOpen(false)}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-transform"
          >
            {t.confirm}
          </button>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal 
        isOpen={isChangePasswordOpen} 
        onClose={() => setIsChangePasswordOpen(false)} 
        title={t.changePassword}
      >
        <form onSubmit={handleChangePassword} className="py-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.oldPassword}</label>
            <input 
              type="password" 
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder={t.oldPassword}
              className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.newPassword}</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.newPassword}
              className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <button 
            type="submit"
            className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all mt-4"
          >
            {t.save}
          </button>
        </form>
      </Modal>

      {/* Address Management Modal */}
      <Modal 
        isOpen={isAddressModalOpen} 
        onClose={() => setIsAddressModalOpen(false)} 
        title={t.addressManagement}
      >
        <div className="py-4 space-y-4">
          {addresses.length > 0 ? (
            addresses.map((addr, idx) => (
              <div key={`${addr.id}-${idx}`} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 relative">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900">{addr.recipientName}</h4>
                    {addr.isDefault && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded uppercase tracking-wider">
                        {t.setDefault}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingAddress(addr);
                        setIsEditFormOpen(true);
                      }}
                      className="text-blue-500 text-xs font-bold"
                    >
                      {t.editAddress}
                    </button>
                    <button 
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-red-500 text-xs font-bold"
                    >
                      {t.deleteAddress}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-1">{addr.phoneNumber}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{addr.detailedAddress}</p>
                {!addr.isDefault && (
                  <button 
                    onClick={() => handleSetDefault(addr.id)}
                    className="mt-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-blue-500 transition-colors"
                  >
                    {t.setDefault}
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-400 italic text-sm">{t.noAddress}</div>
          )}
          <button 
            onClick={() => {
              setEditingAddress(null);
              setIsEditFormOpen(true);
            }}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-100 active:scale-95 transition-transform mt-4"
          >
            {t.addAddress}
          </button>
        </div>
      </Modal>

      {/* Add/Edit Address Modal */}
      <Modal 
        isOpen={isEditFormOpen} 
        onClose={() => {
          setIsEditFormOpen(false);
          setEditingAddress(null);
        }} 
        title={editingAddress ? t.editAddress : t.addAddress}
      >
        <form onSubmit={handleSaveAddress} className="py-4 space-y-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.recipientName}</label>
              <input 
                name="recipientName"
                type="text" 
                defaultValue={editingAddress?.recipientName || ''}
                required
                placeholder={t.recipientName}
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.phoneNumber}</label>
              <input 
                name="phoneNumber"
                type="tel" 
                defaultValue={editingAddress?.phoneNumber || ''}
                required
                placeholder={t.phoneNumber}
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.detailedAddress}</label>
              <textarea 
                name="detailedAddress"
                defaultValue={editingAddress?.detailedAddress || ''}
                required
                placeholder={t.detailedAddress}
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[100px]"
              />
            </div>
            <div className="flex items-center gap-3 px-1">
              <input 
                id="isDefault"
                name="isDefault"
                type="checkbox" 
                defaultChecked={editingAddress?.isDefault || false}
                className="size-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isDefault" className="text-sm font-bold text-slate-600">{t.setDefault}</label>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all mt-4"
          >
            {t.save}
          </button>
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal 
        isOpen={isEditProfileOpen} 
        onClose={() => setIsEditProfileOpen(false)} 
        title={t.editProfile}
      >
        <form onSubmit={handleUpdateProfile} className="py-4 space-y-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">{t.displayName}</label>
              <input 
                type="text" 
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                required
                placeholder={t.displayName}
                className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-slate-800"
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all mt-6"
          >
            {t.updateProfile}
          </button>
        </form>
      </Modal>
    </motion.div>
  );
};

// --- Main App ---

const TrackingListView = ({ 
  requests, 
  onBack, 
  t,
  language
}: { 
  requests: Request[], 
  onBack: () => void, 
  t: any,
  language: Language,
  key?: string 
}) => {
  const userRequests = requests.filter(r => (r.status === 'pending' || (r.status === 'approved' && r.trackingStatus)));

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col pb-24 min-h-screen bg-slate-50"
    >
      <header className="flex items-center justify-between p-6 pt-10 bg-white border-b border-slate-100 sticky top-0 z-30">
        <button 
          onClick={onBack}
          className="size-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-600 active:scale-90 transition-transform"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-slate-900">{t.trackingStatus}</h1>
        <div className="size-10" />
      </header>

      <div className="p-6 space-y-4">
        {userRequests.length > 0 ? (
          userRequests.map((req, idx) => (
            <div key={`tracking-user-request-${req.id}-${idx}`} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3 items-center">
                  <div className={`size-10 rounded-2xl flex items-center justify-center ${
                    req.type === 'borrow' ? 'bg-green-50 text-green-600' : 
                    req.type === 'return' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {req.type === 'borrow' ? <CheckCircle2 size={20} /> : 
                     req.type === 'return' ? <RotateCcw size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 truncate max-w-[180px]">{renderTranslatable(req.bookTitle, language)}</h3>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      {req.type === 'borrow' ? t.borrow : 
                       req.type === 'return' ? t.return : t.renew}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${
                  req.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {req.status === 'pending' ? t.pending : 
                   req.status === 'rejected' ? t.rejected :
                   (t[`status${req.trackingStatus?.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}` as keyof typeof t] || req.trackingStatus)}
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-700 ease-out ${req.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'}`} 
                      style={{ 
                        width: req.status === 'pending' ? (req.type === 'renew' ? '50%' : req.type === 'return' ? '33%' : '25%') :
                               req.status === 'rejected' ? '100%' :
                               req.trackingStatus === 'completed' || req.trackingStatus === 'delivered' ? '100%' : 
                               req.trackingStatus === 'sent' ? '75%' : 
                               req.trackingStatus === 'waiting_to_send' ? '50%' : 
                               req.trackingStatus === 'please_send' ? '66%' : 
                               (req.type === 'renew' ? '50%' : req.type === 'return' ? '33%' : '25%')
                      }} 
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {req.status === 'pending' ? (req.type === 'renew' ? '50%' : req.type === 'return' ? '33%' : '25%') :
                     req.status === 'rejected' ? '100%' :
                     req.trackingStatus === 'completed' || req.trackingStatus === 'delivered' ? '100%' : 
                     req.trackingStatus === 'sent' ? '75%' : 
                     req.trackingStatus === 'waiting_to_send' ? '50%' : 
                     req.trackingStatus === 'please_send' ? '66%' : 
                     (req.type === 'renew' ? '50%' : req.type === 'return' ? '33%' : '25%')}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className={`grid gap-1 ${req.type === 'return' ? 'grid-cols-3' : req.type === 'renew' ? 'grid-cols-2' : 'grid-cols-4'} flex-1`}>
                    {(req.type === 'return' 
                      ? ['approved', 'please_send', 'delivered'] 
                      : req.type === 'renew'
                      ? ['approved', 'completed']
                      : ['approved', 'waiting_to_send', 'sent', 'delivered']
                    ).map((step, stepId, array) => {
                      const isActive = req.trackingStatus === step || (req.status === 'pending' && stepId === 0);
                      const isPast = (req.status === 'approved' && array.indexOf(req.trackingStatus || '') >= stepId) || (req.status === 'pending' && stepId === 0);
                      return (
                        <div key={`tracking-step-${req.id}-${step}-${stepId}`} className="flex flex-col items-center gap-1.5">
                          <div className={`size-2.5 rounded-full ${isPast ? 'bg-blue-500' : 'bg-slate-200'} ${isActive ? 'ring-4 ring-blue-100' : ''}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-tighter text-center ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                            {t[`status${step.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}` as keyof typeof t] || step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(req.trackingStatus === 'delivered' || req.trackingStatus === 'completed') && req.completedAt && (
                  <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider bg-green-50 px-2 py-0.5 rounded-md">
                      {req.trackingStatus === 'completed' ? t.completed : t.statusDelivered}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(req.completedAt).toLocaleDateString()} {new Date(req.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center">
            <div className="size-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
              <Scan size={32} />
            </div>
            <p className="text-slate-400 text-sm italic">{t.noActiveTasks}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Helper ---

const renderTranslatable = (field: string | { [key in Language]: string } | any, lang: Language): string => {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object' && field[lang]) return field[lang];
  return String(field || '');
};

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const t = translations[language];

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [view, setView] = useState<View>('login');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('catAll');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'borrow' | 'return'>('borrow');
  const [bookName, setBookName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowedBooks, setBorrowedBooks] = useState<(Book & { dueDate?: string })[]>([]);
  const [lastView, setLastView] = useState<View>('home');
  const [libraryTab, setLibraryTab] = useState<'all' | 'borrowed'>('all');
  const [renewTarget, setRenewTarget] = useState<string | null>(null);
  const [lockBookName, setLockBookName] = useState(false);
  const [renewDays, setRenewDays] = useState(7);
  const [selectedRenewBooks, setSelectedRenewBooks] = useState<string[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [books, setBooks] = useState<Book[]>(ALL_BOOKS);
  const [events, setEvents] = useState<any[]>([]);
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [addresses, setAddresses] = useState<ShippingAddress[]>([
    { id: '1', recipientName: userDisplayName || t.userName, phoneNumber: '123-456-7890', detailedAddress: '123 Library St, Booktown, BK 12345', isDefault: true },
  ]);

  const [isAuthReady, setIsAuthReady] = useState(false);

  // Feedback state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'primary' | 'danger';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'primary' | 'danger' = 'primary') => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm, type });
  };

  useEffect(() => {
    if (!isAuthReady || !isLoggedIn || !auth.currentUser) return;

    const q = query(collection(db, 'books'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        console.log("No books found in Firestore. Seeding books...");
        ALL_BOOKS.forEach(async (book) => {
          try {
            await setDoc(doc(db, 'books', book.id), {
              ...book,
              availableQuantity: book.quantity,
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Error seeding book:", e);
          }
        });
        setBooks(ALL_BOOKS);
      } else {
        const fetchedBooks: Book[] = [];
        snapshot.forEach(doc => {
          fetchedBooks.push({ id: doc.id, ...doc.data() } as Book);
        });
        setBooks(fetchedBooks);
      }
    }, (error: any) => {
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions') || !auth.currentUser) {
        console.warn("Ignoring books snapshot error due to logout or permission denied:", error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'books');
    });

    return () => unsubscribe();
  }, [isAuthReady, isLoggedIn]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          let role: UserRole = 'user';
          if (userSnap.exists()) {
            role = userSnap.data().role as UserRole;
            setUserDisplayName(userSnap.data().name || user.displayName || '');
            const isAdminEmail = user.email === 'z11bao36g@gmail.com' || user.email === 'admin@hkmu.edu.hk';
            const isAdminUid = user.uid === 'ezLgaHfXhtYV8XpCX986mIYWWHv1';
            
            if ((isAdminEmail || isAdminUid) && role !== 'admin') {
              role = 'admin';
              await updateDoc(userRef, { role: 'admin' });
            }
          } else {
            const isAdminEmail = user.email === 'z11bao36g@gmail.com' || user.email === 'admin@hkmu.edu.hk';
            const isAdminUid = user.uid === 'ezLgaHfXhtYV8XpCX986mIYWWHv1';
            role = (isAdminEmail || isAdminUid) ? 'admin' : 'user';
            const newName = user.displayName || '';
            setUserDisplayName(newName);
            await setDoc(userRef, {
              id: user.uid,
              memberId: Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000),
              name: newName || 'Library Member',
              email: user.email,
              role,
              avatar: user.photoURL || '',
              borrowedBooks: [],
              createdAt: serverTimestamp()
            });
          }
          
          setUserRole(role);
          setIsLoggedIn(true);
          setView(role === 'admin' ? 'adminDashboard' : 'home');
        } catch (error) {
          console.error("Error fetching user role:", error);
        }
      } else {
        setIsLoggedIn(false);
        setUserRole('user');
        setView('login');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !isLoggedIn || !auth.currentUser) return;

    const requestsQuery = userRole === 'admin' 
      ? query(collection(db, 'requests'))
      : query(collection(db, 'requests'), where('userId', '==', auth.currentUser.uid));

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const reqs: Request[] = [];
      snapshot.forEach(doc => {
        reqs.push({ id: doc.id, ...doc.data() } as Request);
      });
      setPendingRequests(reqs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      
      // Derive borrowed books from approved borrow requests that haven't been returned
      if (userRole === 'user') {
        const borrowed: (Book & { dueDate?: string })[] = [];
        const bookStatus = new Map<string, number>(); // bookId -> count of active borrows

        // Sort requests chronologically to process them in order
        const sortedReqs = [...reqs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const r of sortedReqs) {
          if (r.status === 'approved') {
            if (r.type === 'borrow') {
              bookStatus.set(r.bookId, (bookStatus.get(r.bookId) || 0) + 1);
            } else if (r.type === 'return') {
              bookStatus.set(r.bookId, Math.max(0, (bookStatus.get(r.bookId) || 0) - 1));
            }
          }
        }

        bookStatus.forEach((count, bookId) => {
          if (count > 0) {
            const book = books.find(b => b.id === bookId) || ALL_BOOKS.find(b => b.id === bookId);
            if (book) {
              // In a real app, dueDate would be calculated from the borrow date + renewals
              borrowed.push({ ...book, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() });
            }
          }
        });

        setBorrowedBooks(borrowed);
      }
    }, (error: any) => {
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions') || !auth.currentUser) {
        console.warn("Ignoring requests snapshot error due to logout or permission denied:", error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'requests');
    });

    const addressesQuery = query(collection(db, `users/${auth.currentUser.uid}/addresses`));
    const unsubscribeAddresses = onSnapshot(addressesQuery, (snapshot) => {
      const addrs: ShippingAddress[] = [];
      snapshot.forEach(doc => {
        addrs.push({ id: doc.id, ...doc.data() } as ShippingAddress);
      });
      setAddresses(addrs);
    }, (error: any) => {
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions') || !auth.currentUser) {
        console.warn("Ignoring addresses snapshot error due to logout or permission denied:", error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, `users/${auth.currentUser.uid}/addresses`);
    });

    const eventsQuery = query(collection(db, 'events'));
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const fetchedEvents: any[] = [];
      snapshot.forEach(doc => {
        fetchedEvents.push({ id: doc.id, ...doc.data() });
      });
      setEvents(fetchedEvents.length > 0 ? fetchedEvents : EVENTS_DATA);
    }, (error: any) => {
      console.warn("Ignoring events snapshot error:", error);
      setEvents(EVENTS_DATA);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeAddresses();
      unsubscribeEvents();
    };
  }, [isAuthReady, isLoggedIn, userRole]);

  const addNotification = (title: string, message: string, type: 'success' | 'info' | 'admin' = 'success') => {
    const newNotif: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title,
      message,
      date: new Date().toLocaleString(),
      type,
      isRead: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const handleLogin = () => {
    // Handled by onAuthStateChanged
  };

  const performLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoggedIn(false);
      setUserRole('user');
      setView('login');
      setBorrowedBooks([]);
      setPendingRequests([]);
      setAddresses([]);
      setUserDisplayName('');
    }
  };

  const handleLogout = async () => {
    console.log("Triggering handleLogout");
    showConfirm(
      t.logout || "Logout", 
      t.logoutConfirm || "Are you sure you want to logout?", 
      performLogout, 
      'danger'
    );
  };

  const handleAdminAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const reqRef = doc(db, 'requests', id);
      await updateDoc(reqRef, { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const handleUpdateTracking = async (id: string, trackingStatus: TrackingStatus) => {
    try {
      const reqRef = doc(db, 'requests', id);
      const updateData: any = { trackingStatus };
      if (trackingStatus === 'delivered') {
        updateData.completedAt = new Date().toISOString();
      }
      await updateDoc(reqRef, updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `requests/${id}`);
    }
  };

  if (view === 'adminDashboard') {
    return (
      <AdminDashboard 
        books={books}
        requests={pendingRequests}
        onLogout={performLogout}
        t={t}
        language={language}
      />
    );
  }

  return (
    <>
      <div className="relative flex h-auto min-h-screen w-full max-w-[480px] mx-auto flex-col overflow-x-hidden shadow-2xl bg-white">
        <LanguageSwitcher language={language} setLanguage={setLanguage} />
      <AnimatePresence mode="wait">
        {view === 'login' && (
          <LoginView 
            key="login" 
            onLogin={handleLogin} 
            t={t} 
            language={language} 
            setLanguage={setLanguage} 
          />
        )}

        {view === 'home' && (
          <HomeView 
            key="home" 
            books={books}
            userDisplayName={userDisplayName}
            onProfileClick={() => setView('profile')} 
            onBorrowedClick={() => {
              setLibraryTab('borrowed');
              setView('bookshelf');
            }}
            onExploreClick={() => {
              setLibraryTab('all');
              setView('bookshelf');
            }}
            onBookClick={(book) => {
              setSelectedBook(book);
              setLastView('home');
              setView('bookDetail');
            }}
            onBulletinClick={() => setView('events')}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            onRenewClick={() => {
              setRenewTarget(null);
              setIsRenewModalOpen(true);
            }}
            borrowedBooks={borrowedBooks}
            selectedRenewBooks={selectedRenewBooks}
            setSelectedRenewBooks={setSelectedRenewBooks}
            unreadCount={notifications.filter(n => !n.isRead).length}
            language={language}
            t={t}
          />
        )}
        {view === 'bookshelf' && (
          <LibraryView 
            key="bookshelf" 
            books={books}
            borrowed={borrowedBooks} 
            activeTab={libraryTab}
            setActiveTab={setLibraryTab}
            onBookClick={(book) => {
              setSelectedBook(book);
              setLastView('bookshelf');
              setView('bookDetail');
            }}
            onBorrow={(book) => {
              if (borrowedBooks.some(b => b.id === book.id)) {
                setRenewTarget(renderTranslatable(book.title, language));
                setSelectedRenewBooks([book.id]);
                setIsRenewModalOpen(true);
              } else {
                setModalMode('borrow');
                setBookName(renderTranslatable(book.title, language));
                setQuantity('1');
                setLockBookName(true);
                setIsBorrowModalOpen(true);
              }
            }}
            onReturn={(book) => {
              setModalMode('return');
              setBookName(renderTranslatable(book.title, language));
              setQuantity('1');
              setLockBookName(true);
              setIsBorrowModalOpen(true);
            }}
            language={language}
            t={t}
          />
        )}
        {view === 'events' && (
          <BulletinView 
            key="bulletin" 
            notifications={notifications}
            setNotifications={setNotifications}
            events={events}
            t={t}
            language={language}
          />
        )}
        {view === 'bookDetail' && selectedBook && (
          <BookDetailView 
            key="bookDetail"
            book={selectedBook} 
            onBack={() => setView(lastView)}
            isBorrowed={borrowedBooks.some(b => b.id === selectedBook.id)}
            onBorrow={() => {
              if (borrowedBooks.some(b => b.id === selectedBook.id)) {
                setRenewTarget(renderTranslatable(selectedBook.title, language));
                setSelectedRenewBooks([selectedBook.id]);
                setIsRenewModalOpen(true);
              } else {
                setModalMode('borrow');
                setBookName(renderTranslatable(selectedBook.title, language));
                setQuantity('1');
                setLockBookName(true);
                setIsBorrowModalOpen(true);
              }
            }}
            onReturn={() => {
              setModalMode('return');
              setBookName(renderTranslatable(selectedBook.title, language));
              setQuantity('1');
              setLockBookName(true);
              setIsBorrowModalOpen(true);
            }}
            t={t}
            language={language}
          />
        )}
        {view === 'profile' && (
          <ProfileView 
            key="profile" 
            onBack={() => setView('home')} 
            onShowQr={() => setIsQrModalOpen(true)}
            onLogout={handleLogout}
            onViewTracking={() => setView('trackingList')}
            borrowedBooks={borrowedBooks}
            addresses={addresses}
            setAddresses={setAddresses}
            requests={pendingRequests}
            language={language}
            setLanguage={setLanguage}
            t={t}
            showToast={showToast}
            showConfirm={showConfirm}
            setModalMode={setModalMode}
            setBookName={setBookName}
            setLockBookName={setLockBookName}
            setIsBorrowModalOpen={setIsBorrowModalOpen}
            userDisplayName={userDisplayName}
            setUserDisplayName={setUserDisplayName}
          />
        )}
        {view === 'trackingList' && (
          <TrackingListView 
            key="trackingList"
            requests={pendingRequests}
            onBack={() => setView('profile')}
            t={t}
            language={language}
          />
        )}
      </AnimatePresence>

      {isLoggedIn && userRole === 'user' && (
        <BottomNav 
          currentView={view} 
          setView={(v) => {
            setLastView(view);
            setView(v);
          }} 
          unreadCount={notifications.filter(n => !n.isRead).length}
          t={t}
        />
      )}

      {/* Modals */}
      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title={t.digitalPass}>
        <div className="flex flex-col items-center py-6">
          <div className="p-4 bg-slate-50 rounded-3xl mb-4 border border-slate-100">
            <QrCode size={180} className="text-slate-900" />
          </div>
          <p className="text-sm text-slate-500 text-center mb-6">
            {t.qrDesc}
          </p>
          <button 
            onClick={() => setIsQrModalOpen(false)}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm"
          >
            {t.confirm}
          </button>
        </div>
      </Modal>

      <Modal 
        isOpen={isBorrowModalOpen} 
        onClose={() => {
          setIsBorrowModalOpen(false);
          setLockBookName(false);
        }} 
        title={modalMode === 'borrow' ? t.borrow : t.return}
      >
        <div className="flex flex-col items-center py-2">
          <div className="w-full p-4 bg-slate-50 rounded-3xl mb-4 border border-slate-100 flex flex-col items-center">
            <div className={`size-12 rounded-2xl flex items-center justify-center mb-4 ${
              modalMode === 'borrow' ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-600'
            }`}>
              {modalMode === 'borrow' ? <BookOpen size={24} /> : <RotateCcw size={24} />}
            </div>
            
            <div className="w-full space-y-3">
              {lockBookName ? (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.title}</p>
                    <p className="text-sm font-bold text-slate-900">{bookName}</p>
                  </div>
                </div>
              ) : modalMode === 'return' ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t.borrowed}</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1 no-scrollbar">
                    {borrowedBooks.length > 0 ? (
                      borrowedBooks.map((book, idx) => (
                        <button
                          key={`borrow-modal-book-${book.id}-${idx}`}
                          onClick={() => setBookName(renderTranslatable(book.title, language))}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                            bookName === renderTranslatable(book.title, language) 
                            ? 'bg-blue-500 text-white border-blue-500 shadow-md' 
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-200'
                          }`}
                        >
                          <img src={book.cover} alt="" className="w-7 h-9 object-cover rounded shadow-sm" />
                          <div className="text-left">
                            <p className="text-xs font-bold line-clamp-1">{renderTranslatable(book.title, language)}</p>
                            <p className={`text-xs ${bookName === renderTranslatable(book.title, language) ? 'text-blue-100' : 'text-slate-400'}`}>{renderTranslatable(book.author, language)}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-3 text-slate-400 text-xs italic bg-white rounded-xl border border-dashed border-slate-200">
                        {t.noRequests}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t.title}</label>
                  <input 
                    type="text"
                    placeholder={t.title}
                    value={bookName}
                    onChange={(e) => setBookName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm"
                  />
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t.quantity}</label>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setQuantity(prev => Math.max(1, parseInt(prev) - 1).toString())}
                    className="size-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
                  >
                    -
                  </button>
                  <input 
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-center font-bold text-sm"
                  />
                  <button 
                    onClick={() => setQuantity(prev => (parseInt(prev) + 1).toString())}
                    className="size-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
                  >
                    +
                  </button>
                </div>
                {modalMode === 'borrow' && (() => {
                  const book = books.find(b => renderTranslatable(b.title, language) === bookName);
                  if (!book) return null;
                  const avail = book.availableQuantity ?? book.quantity ?? 1;
                  return (
                    <div className="mt-1 text-center">
                      <p className={`text-[10px] font-bold ${avail < parseInt(quantity) ? 'text-red-500' : 'text-slate-400'}`}>
                        {language === 'zh-HK' ? `庫存: ${avail}` : `Available: ${avail}`}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {modalMode === 'borrow' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t.deliveryMethod}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                        deliveryMethod === 'pickup' 
                        ? 'bg-blue-500 text-white border-blue-500 shadow-md' 
                        : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <Building2 size={18} />
                      <span className="text-[10px] font-bold">{t.pickup}</span>
                    </button>
                    <button
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                        deliveryMethod === 'delivery' 
                        ? 'bg-blue-500 text-white border-blue-500 shadow-md' 
                        : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <Phone size={18} />
                      <span className="text-[10px] font-bold">{t.delivery}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <p className="text-xs text-slate-500 text-center mb-4 px-4">
            {lockBookName 
              ? `${t.confirm} ${modalMode === 'borrow' ? t.borrow : t.return} "${bookName}".`
              : modalMode === 'borrow' 
                ? t.borrowDesc 
                : t.returnDesc}
          </p>
          
          <div className="flex gap-3 w-full">
            <button 
              onClick={() => setIsBorrowModalOpen(false)}
              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm"
            >
              {t.cancel}
            </button>
            <button 
              disabled={!bookName.trim() || !quantity || parseInt(quantity) < 1 || (modalMode === 'borrow' && (() => {
                const book = books.find(b => renderTranslatable(b.title, language) === bookName);
                return book && (book.availableQuantity ?? book.quantity ?? 1) < parseInt(quantity);
              })())}
              onClick={async () => {
                setIsBorrowModalOpen(false);
                if (!auth.currentUser) return;
                try {
                  if (modalMode === 'return') {
                    const book = borrowedBooks.find(b => renderTranslatable(b.title, language) === bookName);
                    if (book) {
                      const newReqRef = doc(collection(db, 'requests'));
                      await setDoc(newReqRef, {
                        id: newReqRef.id,
                        type: 'return',
                        bookId: book.id,
                        bookTitle: book.title,
                        userId: auth.currentUser.uid,
                        userName: userDisplayName || t.userName,
                        status: 'pending',
                        trackingStatus: 'pending',
                        date: new Date().toISOString(),
                        quantity: parseInt(quantity),
                        createdAt: serverTimestamp()
                      });
                      showToast(t.processed);
                      setIsBorrowModalOpen(false);
                    }
                  } else {
                    const book = books.find(b => renderTranslatable(b.title, language) === bookName);
                    if (book && (book.availableQuantity ?? book.quantity ?? 1) < parseInt(quantity)) {
                      showToast(t.insufficientStock || "Insufficient stock", "error");
                      return;
                    }
                    const newReqRef = doc(collection(db, 'requests'));
                    await setDoc(newReqRef, {
                      id: newReqRef.id,
                      type: 'borrow',
                      bookId: book?.id || 'unknown',
                      bookTitle: book ? book.title : { en: bookName, 'zh-HK': bookName },
                      userId: auth.currentUser.uid,
                      userName: userDisplayName || t.userName,
                      status: 'pending',
                      trackingStatus: 'pending',
                      deliveryMethod: deliveryMethod,
                      date: new Date().toISOString(),
                      quantity: parseInt(quantity),
                      createdAt: serverTimestamp()
                    });
                    showToast(t.processed);
                    setIsBorrowModalOpen(false);
                  }
                } catch (err) {
                  console.error('Action failed:', err);
                  handleFirestoreError(err, OperationType.CREATE, 'requests');
                }
              }}
              className={`flex-1 py-3 text-white rounded-xl font-bold text-sm shadow-lg transition-all ${
                !bookName.trim() || !quantity || parseInt(quantity) < 1 || (modalMode === 'borrow' && (() => {
                  const book = books.find(b => renderTranslatable(b.title, language) === bookName);
                  return book && (book.availableQuantity ?? book.quantity ?? 1) < parseInt(quantity);
                })())
                ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                : modalMode === 'borrow' ? 'bg-orange-500 shadow-orange-200' : 'bg-yellow-500 shadow-yellow-200'
              }`}
            >
              {t.confirm}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRenewModalOpen} onClose={() => setIsRenewModalOpen(false)} title={t.renew}>
        <div className="flex flex-col items-center py-6">
          <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-4">
            <RotateCcw size={32} />
          </div>
          <h4 className="text-lg font-bold text-slate-900 mb-2">{t.confirm}</h4>
          <p className="text-sm text-slate-500 text-center mb-8 px-4">
            {renewTarget 
              ? `${t.confirm} "${renewTarget}".`
              : `${t.confirm} ${selectedRenewBooks.length} ${t.borrowed}.`}
          </p>

          <div className="w-full mb-8 flex flex-col items-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center mb-3">{t.quantity}</p>
            <div className="flex flex-col items-center gap-1">
              <button 
                onClick={() => setRenewDays(prev => Math.max(1, prev - 1))}
                className={`p-1 transition-colors ${renewDays === 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-blue-500'}`}
                disabled={renewDays === 1}
              >
                <ChevronUp size={20} />
              </button>
              
              <div className="relative w-28 h-28 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                {/* Highlight bar */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="w-full h-10 bg-blue-500/10 border-y border-blue-500/20" />
                </div>
                
                <div className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-9">
                  {[1, 2, 3, 4, 5, 6, 7].map((day, idx) => (
                    <button
                      key={`renew-day-${day}-${idx}`}
                      onClick={() => setRenewDays(day)}
                      className={`w-full h-10 flex items-center justify-center font-bold transition-all snap-center ${
                        renewDays === day
                        ? 'text-blue-600 text-base'
                        : 'text-slate-400 text-xs opacity-40'
                      }`}
                    >
                      {day} {t.days}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setRenewDays(prev => Math.min(7, prev + 1))}
                className={`p-1 transition-colors ${renewDays === 7 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-blue-500'}`}
                disabled={renewDays === 7}
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button 
              disabled={selectedRenewBooks.length === 0}
              onClick={async () => {
                setIsRenewModalOpen(false);
                if (!auth.currentUser) return;
                try {
                  for (const bookId of selectedRenewBooks) {
                    const book = books.find(b => b.id === bookId) || ALL_BOOKS.find(b => b.id === bookId);
                    const newReqRef = doc(collection(db, 'requests'));
                    await setDoc(newReqRef, {
                      id: newReqRef.id,
                      type: 'renew',
                      bookId,
                      bookTitle: book ? book.title : { en: 'Unknown', 'zh-HK': 'Unknown' },
                      userId: auth.currentUser.uid,
                      userName: userDisplayName || t.userName,
                      status: 'pending',
                      trackingStatus: 'pending',
                      date: new Date().toISOString(),
                      days: renewDays,
                      createdAt: serverTimestamp()
                    });
                  }
                  setSelectedRenewBooks([]);
                  showToast(t.processed);
                } catch (err) {
                  console.error('Renewal failed:', err);
                  handleFirestoreError(err, OperationType.CREATE, 'requests');
                }
              }}
              className={`w-full py-4 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
                selectedRenewBooks.length === 0
                ? 'bg-slate-300 shadow-none cursor-not-allowed'
                : 'bg-blue-500 shadow-blue-100'
              }`}
            >
              <CheckCircle2 size={18} />
              {t.confirm} ({renewDays} {t.days})
            </button>
            <button 
              onClick={() => setIsRenewModalOpen(false)}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </Modal>
    </div>

    {/* Toast Notification */}
    <AnimatePresence>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </AnimatePresence>

    {/* Global Confirm Dialog */}
    <ConfirmDialog
      isOpen={confirmDialog.isOpen}
      title={confirmDialog.title}
      message={confirmDialog.message}
      type={confirmDialog.type}
      onConfirm={() => {
        confirmDialog.onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }}
      onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
    />
    </>
  );
}
