import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Users, LayoutDashboard, Settings, LogOut, Plus, Edit2, Trash2, Search, Bell, Filter, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, MapPin, Download, FileText, Calendar, Building2, Phone, User, Lock, TrendingUp } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Toast, ToastType, ConfirmDialog } from './ui/Feedback';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

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
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
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

// Types
// Assuming these are passed or imported
export const AdminDashboard = ({ 
  books, 
  requests,
  onLogout,
  t,
  language
}: any) => {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [readNotifs, setReadNotifs] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

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

  const handleAdminLogout = () => {
    showConfirm(
      t.logout || "Logout",
      t.logoutConfirm || "Are you sure you want to logout?",
      onLogout,
      'danger'
    );
  };

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedUsers: any[] = [];
      snapshot.forEach(doc => {
        fetchedUsers.push({ id: doc.id, ...doc.data() });
      });
      setUsers(fetchedUsers);
    });

    const eventsQ = query(collection(db, 'events'));
    const unsubscribeEvents = onSnapshot(eventsQ, (snapshot) => {
      const fetchedEvents: any[] = [];
      snapshot.forEach(doc => {
        fetchedEvents.push({ id: doc.id, ...doc.data() });
      });
      setEvents(fetchedEvents);
    });

    return () => {
      unsubscribe();
      unsubscribeEvents();
    };
  }, []);
  
  // Book CRUD state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [bookForm, setBookForm] = useState({
    titleEn: '',
    titleZh: '',
    authorEn: '',
    authorZh: '',
    category: 'catPhilosophy',
    cover: '',
    descriptionEn: '',
    descriptionZh: '',
    storageLocation: '',
    quantity: 1
  });

  const [eventForm, setEventForm] = useState({
    titleEn: '',
    titleZh: '',
    date: '',
    time: '',
    locationEn: '',
    locationZh: '',
    category: 'eventWorkshop',
    image: ''
  });

  const handleOpenEventModal = (event: any = null) => {
    if (event) {
      setEditingEvent(event);
      setEventForm({
        titleEn: event.title?.en || '',
        titleZh: event.title?.zh || '',
        date: event.date || '',
        time: event.time || '',
        locationEn: event.location?.en || '',
        locationZh: event.location?.zh || '',
        category: event.category || 'eventWorkshop',
        image: event.image || ''
      });
    } else {
      setEditingEvent(null);
      setEventForm({
        titleEn: '',
        titleZh: '',
        date: '',
        time: '',
        locationEn: '',
        locationZh: '',
        category: 'eventWorkshop',
        image: ''
      });
    }
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = 'events';
    try {
      const eventData = {
        title: { en: eventForm.titleEn, zh: eventForm.titleZh },
        date: eventForm.date,
        time: eventForm.time,
        location: { en: eventForm.locationEn, zh: eventForm.locationZh },
        category: eventForm.category,
        image: eventForm.image,
        updatedAt: serverTimestamp()
      };

      if (editingEvent) {
        await updateDoc(doc(db, path, editingEvent.id), eventData);
      } else {
        const newDocRef = doc(collection(db, path));
        await setDoc(newDocRef, {
          ...eventData,
          id: newDocRef.id,
          createdAt: serverTimestamp()
        });
      }
      setIsEventModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingEvent ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    showConfirm(
      "Delete Event",
      "Are you sure you want to delete this event? This action cannot be undone.",
      async () => {
        const path = 'events';
        try {
          await deleteDoc(doc(db, path, eventId));
          showToast("Event deleted successfully");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      },
      'danger'
    );
  };

  const handleOpenBookModal = (book?: any) => {
    if (book) {
      setEditingBook(book);
      setBookForm({
        titleEn: book.title?.en || '',
        titleZh: book.title?.['zh-HK'] || '',
        authorEn: book.author?.en || '',
        authorZh: book.author?.['zh-HK'] || '',
        category: book.category || 'catPhilosophy',
        cover: book.cover || '',
        descriptionEn: book.description?.en || '',
        descriptionZh: book.description?.['zh-HK'] || '',
        storageLocation: book.storageLocation || '',
        quantity: book.quantity || 1
      });
    } else {
      setEditingBook(null);
      setBookForm({
        titleEn: '', titleZh: '', authorEn: '', authorZh: '',
        category: 'catPhilosophy', cover: '', descriptionEn: '', descriptionZh: '', storageLocation: '',
        quantity: 1
      });
    }
    setIsBookModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = 'books';
    try {
      const bookData = {
        title: { en: bookForm.titleEn, 'zh-HK': bookForm.titleZh },
        author: { en: bookForm.authorEn, 'zh-HK': bookForm.authorZh },
        category: bookForm.category,
        cover: bookForm.cover,
        description: { en: bookForm.descriptionEn, 'zh-HK': bookForm.descriptionZh },
        storageLocation: bookForm.storageLocation,
        quantity: bookForm.quantity,
        availableQuantity: editingBook ? Math.max(0, bookForm.quantity - ((editingBook.quantity || 0) - (editingBook.availableQuantity || 0))) : bookForm.quantity,
        updatedAt: serverTimestamp()
      };

      if (editingBook) {
        await updateDoc(doc(db, path, editingBook.id), bookData);
      } else {
        const newDocRef = doc(collection(db, path));
        await setDoc(newDocRef, {
          ...bookData,
          id: newDocRef.id,
          createdAt: serverTimestamp()
        });
      }
      setIsBookModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingBook ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteBook = async (id: string) => {
    showConfirm(
      "Delete Book",
      "Are you sure you want to delete this book? This will remove it from the inventory.",
      async () => {
        const path = 'books';
        try {
          await deleteDoc(doc(db, path, id));
          showToast("Book deleted successfully");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      },
      'danger'
    );
  };

  const [userSearchQuery, setUserSearchQuery] = useState('');

  const pendingRequests = requests?.filter((r: any) => r.status === 'pending') || [];
  const notifications = pendingRequests
    .filter((r: any) => !readNotifs.has(r.id))
    .map((r: any) => ({
      id: r.id,
      title: r.type === 'borrow' ? 'New Borrow Request' : r.type === 'return' ? 'New Return Request' : 'New Renew Request',
      desc: `${r.userName} requested to ${r.type} "${r.bookTitle?.en || r.bookTitle}"`,
      time: r.createdAt ? new Date(r.createdAt.toMillis ? r.createdAt.toMillis() : Date.now()).toLocaleDateString() : 'Just now',
      icon: BookOpen,
      color: 'text-blue-600 bg-blue-50'
    }));

  const handleMarkAllRead = () => {
    const newRead = new Set(readNotifs);
    pendingRequests.forEach((r: any) => newRead.add(r.id));
    setReadNotifs(newRead);
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    showConfirm(
      "Change User Role",
      `Are you sure you want to change this user's role to ${newRole}?`,
      async () => {
        const path = 'users';
        try {
          await updateDoc(doc(db, path, userId), {
            role: newRole
          });
          showToast(`User role updated to ${newRole}`);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    );
  };

  const handleUpdateReqStatus = async (reqId: string, newStatus: string, trackingStatus?: string) => {
    const path = 'requests';
    try {
      console.log('Admin Action: Updating request', { reqId, newStatus, trackingStatus });
      const req = requests.find((r: any) => r.id === reqId);
      if (!req) {
        showToast("Request not found", "error");
        return;
      }
      
      const updateData: any = { status: newStatus };
      
      // Handle availableQuantity update
      // Borrow: Decrease when approved
      if (newStatus === 'approved' && req.status === 'pending' && req.type === 'borrow') {
        const book = books.find((b: any) => b.id === req.bookId);
        if (book) {
          const currentQty = book.availableQuantity ?? book.quantity ?? 1;
          const borrowQty = req.quantity || 1;
          const newAvailable = Math.max(0, currentQty - borrowQty);
          
          console.log('Admin Action: Updating book inventory', { bookId: book.id, currentQty, borrowQty, newAvailable });
          await updateDoc(doc(db, 'books', book.id), { 
            availableQuantity: newAvailable,
            updatedAt: serverTimestamp()
          });
        }
      } 
      // Return: Increase when trackingStatus is delivered (received)
      else if (newStatus === 'approved' && trackingStatus === 'delivered' && req.trackingStatus !== 'delivered' && req.type === 'return') {
        const book = books.find((b: any) => b.id === req.bookId);
        if (book) {
          const currentQty = (book.availableQuantity ?? book.quantity ?? 1);
          const returnQty = (req.quantity || 1);
          const newAvailable = Math.min(book.quantity || 1, currentQty + returnQty);
          
          console.log('Admin Action: Returning book to inventory', { bookId: book.id, currentQty, returnQty, newAvailable });
          await updateDoc(doc(db, 'books', book.id), { 
            availableQuantity: newAvailable,
            updatedAt: serverTimestamp()
          });
        }
      }
      // Reverting rejection if needed (Reverting approval)
      else if (newStatus === 'rejected' && req.status === 'approved') {
        const book = books.find((b: any) => b.id === req.bookId);
        if (book) {
          if (req.type === 'borrow') {
            const newAvailable = Math.min(book.quantity || 1, (book.availableQuantity ?? book.quantity ?? 1) + (req.quantity || 1));
            await updateDoc(doc(db, 'books', book.id), { availableQuantity: newAvailable });
          } else if (req.type === 'return' && req.trackingStatus === 'delivered') {
            const newAvailable = Math.max(0, (book.availableQuantity ?? book.quantity ?? 1) - (req.quantity || 1));
            await updateDoc(doc(db, 'books', book.id), { availableQuantity: newAvailable });
          }
        }
      }

      let finalTrackingStatus = trackingStatus;
      
      // If it's a borrow request with pickup method and it's being approved
      if (newStatus === 'approved' && req.type === 'borrow' && req.deliveryMethod === 'pickup' && trackingStatus === 'waiting_to_send') {
        finalTrackingStatus = 'delivered';
      }

      if (finalTrackingStatus) {
        updateData.trackingStatus = finalTrackingStatus;
      }
      
      if (finalTrackingStatus === 'delivered' || finalTrackingStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
      }
      
      console.log('Admin Action: Committing request update', updateData);
      await updateDoc(doc(db, path, reqId), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      showToast(`Request marked as ${newStatus}`);
    } catch (error: any) {
      console.error('Update Request Detailed Error:', error);
      const errorMessage = error?.message || String(error);
      const isPermissionError = errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('insufficient');
      
      let displayError = "Failed to update request";
      if (isPermissionError) {
        displayError = "Permission denied (Admin only)";
      } else if (errorMessage.includes("offline")) {
        displayError = "Currently offline. Please check connection.";
      }
      
      showToast(displayError, "error");
    }
  };

  const filteredBooks = books.filter((book: any) => 
    (book.title?.en || book.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (book.author?.en || book.author || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter((user: any) => 
    (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getBookTitle = (title: any) => {
    if (!title) return 'Unknown Book';
    if (typeof title === 'string') return title;
    return title.en || title['zh-HK'] || 'Unknown Book';
  };

  const filteredRequests = requests?.filter((req: any) => 
    getBookTitle(req.bookTitle).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (req.userName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderContent = () => {
    switch (activeMenu) {
      case 'inventory':
        return (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.inventoryManager}</h2>
                <p className="text-slate-500">Manage the digital footprint of your physical collection.</p>
              </div>
              <button 
                onClick={() => handleOpenBookModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={20} />
                {t.add}
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex gap-4 bg-slate-50/50">
                <div className="flex-1 flex gap-4">
                  <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500">
                    <option>All Genres</option>
                  </select>
                  <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500">
                    <option>Any Author</option>
                  </select>
                  <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500">
                    <option>Status: All</option>
                  </select>
                </div>
                <button className="flex items-center gap-2 text-sm font-medium text-blue-600 px-4 py-2 hover:bg-blue-50 rounded-lg transition-colors">
                  <Filter size={16} />
                  Advanced Sort
                </button>
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-4 pl-6">Catalog Item</th>
                      <th className="p-4">Classification</th>
                      <th className="p-4">Availability</th>
                      <th className="p-4">Storage Loc.</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBooks.map((book: any, idx: number) => (
                      <tr key={`desktop-book-inventory-${book.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-4">
                            <img src={book.cover || 'https://via.placeholder.com/40x60'} alt="" className="w-10 h-14 object-cover rounded shadow-sm" />
                            <div>
                              <p className="font-bold text-slate-900">{book.title?.en || book.title}</p>
                              <p className="text-sm text-slate-500">{book.author?.en || book.author}</p>
                              <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded font-mono">
                                ID: {book.id.slice(0, 8)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full uppercase tracking-wider">
                            {book.category.replace('cat', '')}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: '80%' }}></div>
                            </div>
                            <span className="text-xs font-medium text-slate-600">80%</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <MapPin size={16} className="text-slate-400" />
                            {book.storageLocation || 'Unassigned'}
                          </div>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2 transition-opacity">
                            <button 
                              onClick={() => handleOpenBookModal(book)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Book"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteBook(book.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Book"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Inventory Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredBooks.map((book: any, idx: number) => (
                  <div key={`mobile-book-card-${book.id}-${idx}`} className="p-4 space-y-4">
                    <div className="flex gap-4">
                      <img src={book.cover || 'https://via.placeholder.com/40x60'} alt="" className="w-16 h-24 object-cover rounded shadow-sm shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{book.title?.en || book.title}</p>
                        <p className="text-sm text-slate-500 truncate">{book.author?.en || book.author}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            {book.category.replace('cat', '')}
                          </span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] rounded font-mono">
                            ID: {book.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <MapPin size={14} className="text-slate-400" />
                        {book.storageLocation || 'Unassigned'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleOpenBookModal(book)}
                          className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteBook(book.id)}
                          className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'users':
        const filteredUsers = users.filter(user => 
          user.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          user.memberId?.toLowerCase().includes(userSearchQuery.toLowerCase())
        );
        return (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t.userManager}</h2>
                <p className="text-slate-500 mt-1">Manage library members and administrative roles.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                <div className="relative w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search users by name, email, or ID..." 
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-4 pl-6">User</th>
                      <th className="p-4">Member ID</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Borrowed Books</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((user: any, idx: number) => (
                      <tr key={`desktop-user-inventory-${user.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-4">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover shadow-sm" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                                {user.name?.charAt(0) || 'U'}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900">{user.name}</p>
                              <p className="text-sm text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">
                            {user.memberId}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                            user.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {user.role || 'user'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <BookOpen size={16} className="text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">{user.borrowedBooks?.length || 0}</span>
                          </div>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2 transition-opacity">
                            <button 
                              onClick={() => handleToggleRole(user.id, user.role)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                            >
                              <Users size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Users Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredUsers.map((user: any, idx: number) => (
                  <div key={`mobile-user-card-${user.id}-${idx}`} className="p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover shadow-sm shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl shrink-0">
                          {user.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{user.name}</p>
                        <p className="text-sm text-slate-500 truncate">{user.email}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded font-mono">
                            {user.memberId}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                            user.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {user.role || 'user'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <BookOpen size={16} className="text-slate-400" />
                        <span className="font-medium">{user.borrowedBooks?.length || 0} books</span>
                      </div>
                      <button 
                        onClick={() => handleToggleRole(user.id, user.role)}
                        className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                      >
                        <Users size={16} />
                        {user.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'dashboard':
        return (
          <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t.dashboardOverview}</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">{t.systemStatus}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <button 
                onClick={() => setActiveMenu('inventory')}
                className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between text-left hover:border-blue-300 hover:shadow-md transition-all active:scale-95"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <BookOpen size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">{books.length}</p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{t.totalBooks}</p>
                </div>
              </button>

              <button 
                onClick={() => setActiveMenu('users')}
                className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between text-left hover:border-emerald-300 hover:shadow-md transition-all active:scale-95"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Users size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">{users.length}</p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{t.totalMembers}</p>
                </div>
              </button>

              <button 
                onClick={() => setActiveMenu('circulation')}
                className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between text-left hover:border-amber-300 hover:shadow-md transition-all active:scale-95"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-amber-50 text-amber-600 rounded-xl">
                    <AlertCircle size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">
                    {requests?.filter((r: any) => r.status === 'pending').length || 0}
                  </p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{t.pendingRequestsLimit}</p>
                </div>
              </button>

              <button 
                onClick={() => setActiveMenu('circulation')}
                className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between text-left hover:border-purple-300 hover:shadow-md transition-all active:scale-95"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-purple-50 text-purple-600 rounded-xl">
                    <Clock size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">
                    {requests?.filter((r: any) => r.status === 'approved' && r.type === 'borrow').length || 0}
                  </p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{t.activeBorrows}</p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-900">{t.recentActivity}</h3>
                  <button 
                    onClick={() => setActiveMenu('circulation')}
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {t.viewAllCat}
                  </button>
                </div>
                <div className="space-y-4">
                  {requests?.slice(0, 5).map((req: any, idx: number) => (
                    <button 
                      key={`dashboard-overview-req-${req.id}-${idx}`} 
                      onClick={() => {
                        setActiveMenu('circulation');
                        setSearchQuery(getBookTitle(req.bookTitle));
                      }}
                      className="w-full flex items-center gap-4 p-3 hover:bg-blue-50 rounded-xl transition-colors text-left group"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${req.status === 'pending' ? 'bg-amber-500' : req.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {req.type === 'borrow' ? t.borrowRequest : req.type === 'return' ? t.returnRequest : t.renewRequest}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {getBookTitle(req.bookTitle)} • {new Date(req.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-md uppercase tracking-wider text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                          {t[req.status as keyof typeof t] || req.status}
                        </span>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                  {(!requests || requests.length === 0) && (
                    <p className="text-sm text-slate-500 text-center py-4">{t.noRecentActivity}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'circulation':
        return (
          <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t.circulationManager}</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">{t.circulationDesc}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      <th className="p-4 pl-6">Request Type</th>
                      <th className="p-4">Book Details</th>
                      <th className="p-4">User</th>
                      <th className="p-4">Method</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests?.map((req: any, idx: number) => (
                      <tr key={`desktop-req-${req.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              req.type === 'borrow' ? 'bg-blue-50 text-blue-600' :
                              req.type === 'return' ? 'bg-emerald-50 text-emerald-600' :
                              req.type === 'event' ? 'bg-yellow-50 text-yellow-600' :
                              'bg-purple-50 text-purple-600'
                            }`}>
                              {req.type === 'borrow' ? <BookOpen size={16} /> :
                               req.type === 'return' ? <CheckCircle2 size={16} /> :
                               req.type === 'event' ? <Calendar size={16} /> :
                               <Clock size={16} />}
                            </div>
                            <span className="font-medium text-slate-900 capitalize">{t[req.type as keyof typeof t] || req.type}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-bold text-slate-900">{req.type === 'event' ? getBookTitle(req.eventTitle) : getBookTitle(req.bookTitle)}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {req.type === 'event' ? req.eventId?.slice(0, 8) : req.bookId?.slice(0, 8)}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-medium text-slate-900">{req.userName || 'Unknown User'}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                            req.deliveryMethod === 'pickup' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {t[req.deliveryMethod as keyof typeof t] || req.deliveryMethod || t.delivery}
                          </span>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-slate-600">{new Date(req.date).toLocaleDateString()}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                            req.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                            req.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {t[req.status as keyof typeof t] || req.status}
                          </span>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          {req.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleUpdateReqStatus(req.id, 'approved', req.type === 'borrow' ? 'waiting_to_send' : req.type === 'return' ? 'please_send' : 'completed')}
                                className="px-4 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95 shadow-sm hover:shadow-md hover:shadow-emerald-200/50"
                              >
                                {t.approve || 'Approve'}
                              </button>
                              <button 
                                onClick={() => handleUpdateReqStatus(req.id, 'rejected')}
                                className="px-4 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95 shadow-sm hover:shadow-md hover:shadow-rose-200/50"
                              >
                                {t.reject || 'Reject'}
                              </button>
                            </div>
                          ) : req.status === 'approved' && req.trackingStatus !== 'delivered' && req.trackingStatus !== 'completed' ? (
                            <div className="flex items-center justify-end gap-2">
                              {req.type === 'borrow' && req.trackingStatus === 'waiting_to_send' && (
                                <button 
                                  onClick={() => handleUpdateReqStatus(req.id, 'approved', 'sent')}
                                  className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
                                >
                                  Mark as Sent
                                </button>
                              )}
                              {req.type === 'borrow' && req.trackingStatus === 'sent' && (
                                <button 
                                  onClick={() => handleUpdateReqStatus(req.id, 'approved', 'delivered')}
                                  className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
                                >
                                  Mark as Delivered
                                </button>
                              )}
                              {req.type === 'return' && req.trackingStatus === 'please_send' && (
                                <button 
                                  onClick={() => handleUpdateReqStatus(req.id, 'approved', 'delivered')}
                                  className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
                                >
                                  Mark as Returned
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!requests || requests.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">No circulation requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Circulation Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredRequests?.map((req: any, idx: number) => (
                  <div key={`mobile-req-${req.id}-${idx}`} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          req.type === 'borrow' ? 'bg-blue-50 text-blue-600' :
                          req.type === 'return' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-purple-50 text-purple-600'
                        }`}>
                          {req.type === 'borrow' ? <BookOpen size={16} /> :
                           req.type === 'return' ? <CheckCircle2 size={16} /> :
                           <Clock size={16} />}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 capitalize block">{t[req.type as keyof typeof t] || req.type}</span>
                          <span className="text-xs text-slate-500">{new Date(req.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        req.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                        req.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {t[req.status as keyof typeof t] || req.status}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-sm font-bold text-slate-900 truncate">{getBookTitle(req.bookTitle)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-slate-500">{t.user}: {req.userName || 'Unknown User'}</p>
                        <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase tracking-wider ${
                          req.deliveryMethod === 'pickup' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {t[req.deliveryMethod as keyof typeof t] || req.deliveryMethod || t.delivery}
                        </span>
                      </div>
                    </div>
                    {req.status === 'pending' ? (
                      <div className="flex gap-2 pt-2">
                        <button 
                          onClick={() => handleUpdateReqStatus(req.id, 'approved', req.type === 'borrow' ? 'waiting_to_send' : req.type === 'return' ? 'please_send' : 'completed')}
                          className="flex-1 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-colors"
                        >
                          {t.approve}
                        </button>
                        <button 
                          onClick={() => handleUpdateReqStatus(req.id, 'rejected')}
                          className="flex-1 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-bold transition-colors"
                        >
                          {t.reject}
                        </button>
                      </div>
                    ) : req.status === 'approved' && req.trackingStatus !== 'delivered' && req.trackingStatus !== 'completed' ? (
                      <div className="flex gap-2 pt-2">
                        {req.type === 'borrow' && req.trackingStatus === 'waiting_to_send' && (
                          <button 
                            onClick={() => handleUpdateReqStatus(req.id, 'approved', 'sent')}
                            className="flex-1 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-sm font-bold transition-colors"
                          >
                            {t.statusSent}
                          </button>
                        )}
                        {req.type === 'borrow' && req.trackingStatus === 'sent' && (
                          <button 
                            onClick={() => handleUpdateReqStatus(req.id, 'approved', 'delivered')}
                            className="flex-1 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-xl text-sm font-bold transition-colors"
                          >
                            {t.statusDelivered}
                          </button>
                        )}
                        {req.type === 'return' && req.trackingStatus === 'please_send' && (
                          <button 
                            onClick={() => handleUpdateReqStatus(req.id, 'approved', 'delivered')}
                            className="flex-1 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-xl text-sm font-bold transition-colors"
                          >
                            {t.return}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
                {(!requests || requests.length === 0) && (
                  <div className="p-8 text-center text-slate-500">No circulation requests found.</div>
                )}
              </div>
            </div>
          </div>
        );
      case 'reports':
        return (
          <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Reports & Analytics</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">Library usage statistics and insights.</p>
              </div>
              <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors text-sm">
                <Download size={16} />
                Export Data
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Most Popular Books</h3>
                <div className="space-y-4">
                  {books.slice(0, 3).map((book: any, idx: number) => (
                    <div key={`popular-books-stats-${book.id}-${idx}`} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{book.title?.en || book.title}</p>
                        <p className="text-xs text-slate-500 truncate">{book.author?.en || book.author}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Active Users</h3>
                <div className="space-y-4">
                  {users.slice(0, 3).map((user: any, idx: number) => (
                    <div key={`active-users-stats-${user.id}-${idx}`} className="flex items-center gap-4">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {user.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.borrowedBooks?.length || 0} borrows</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">System Health</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Database Status</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Online</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Storage Used</span>
                    <span className="text-sm font-medium text-slate-900">45%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">Configure library rules and system preferences.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-3xl">
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">General Configuration</h3>
                <p className="text-sm text-slate-500 mt-1">Update your library's core settings.</p>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Library Name</label>
                    <input type="text" defaultValue="HKMU" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Contact Email</label>
                    <input type="email" defaultValue="admin@hkmu.edu.hk" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Circulation Rules</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Max Borrow Limit (Books)</label>
                      <input type="number" defaultValue={5} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Standard Loan Period (Days)</label>
                      <input type="number" defaultValue={14} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Notifications</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                      <span className="text-sm text-slate-700">Email alerts for new borrow requests</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                      <span className="text-sm text-slate-700">Daily summary of overdue items</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                <button className="px-6 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                  Discard Changes
                </button>
                <button className="px-6 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200" onClick={() => showToast('Settings saved successfully!')}>
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        );
      case 'events':
        return (
          <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t.eventManager}</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">Manage workshops, readings, and community events.</p>
              </div>
              <button 
                onClick={() => handleOpenEventModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={20} />
                {t.add}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event: any, idx: number) => (
                <div key={`admin-event-${event.id}-${idx}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
                  <div className="h-40 relative">
                    <img src={event.image || 'https://via.placeholder.com/400x200'} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-bold text-blue-500">
                      {event.category}
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-slate-900 mb-2 truncate">{event.title?.en || event.title}</h3>
                    <div className="space-y-2 mb-4">
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
                        <span className="truncate">{event.location?.en || event.location}</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenEventModal(event)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                  No events found. Click "Add New Event" to create one.
                </div>
              )}
            </div>
          </div>
        );
      case 'reports':
        // Generate mock timeline data based on requests
        const last7Days = Array.from({length: 7}, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return `${d.getMonth()+1}/${d.getDate()}`;
        });
        
        const chartData = last7Days.map(dateLabel => {
          // In a real app, group matching 'date' strings from requests
          // Here we create some dynamic pseudo-random numbers keyed off the label string length and array length
          const randomFactor = dateLabel.length + Math.random() * 5;
          return {
            name: dateLabel,
            borrows: Math.floor(Math.random() * 20 + 5),
            returns: Math.floor(Math.random() * 15 + 2),
            renewals: Math.floor(Math.random() * 10)
          };
        });

        // Category breakdown
        const categoryData = [
          { name: 'Computer Sci', value: books.filter((b:any) => b.category === 'catComputer').length || 10 },
          { name: 'Phil & Design', value: books.filter((b:any) => b.category === 'catPhilosophy').length || 4 },
          { name: 'Business', value: books.filter((b:any) => b.category === 'catBusiness').length || 8 },
        ];

        return (
          <div className="p-8 h-full overflow-y-auto w-full">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Analytics & Reports</h3>
                <p className="text-slate-500 mt-1">Platform usage statistics and activity</p>
              </div>
              <button className="px-4 py-2 bg-white text-blue-600 font-bold border border-blue-100 rounded-xl hover:bg-blue-50 transition-colors flex gap-2 items-center text-sm shadow-sm">
                <Download size={16} />
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <TrendingUp size={20} />
                </div>
                <p className="text-sm font-medium text-slate-500">Total Borrows (Month)</p>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-bold text-slate-900">142</p>
                  <span className="text-sm font-bold text-emerald-500 mb-1">+12%</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                  <BookOpen size={20} />
                </div>
                <p className="text-sm font-medium text-slate-500">Active Collection Read Rate</p>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-bold text-slate-900">68%</p>
                  <span className="text-sm font-bold text-emerald-500 mb-1">+5%</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-2">
                  <Users size={20} />
                </div>
                <p className="text-sm font-medium text-slate-500">Active Members</p>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-bold text-slate-900">{users.length}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Main Activity Chart */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-1 lg:col-span-2">
                <h4 className="text-lg font-bold text-slate-900 mb-6">7-Day Circulation Activity</h4>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                      <RechartsTooltip 
                        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      />
                      <Line type="monotone" dataKey="borrows" name="Borrows" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                      <Line type="monotone" dataKey="returns" name="Returns" stroke="#10b981" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} />
                      <Line type="monotone" dataKey="renewals" name="Renewals" stroke="#f59e0b" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Bar Chart */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h4 className="text-lg font-bold text-slate-900 mb-6">Collection by Category</h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} />
                      <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              {/* System Stats Map pseudo */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={40} />
                </div>
                <h4 className="text-xl font-bold text-slate-900">System Healthy</h4>
                <p className="text-slate-500 mt-2 text-sm max-w-[250px]">All library servers are responding normally. API latency is currently 42ms.</p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="p-8 flex items-center justify-center h-full text-slate-400">
            <p>This module is under construction.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 bg-slate-50 border-r border-slate-200 flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-600">Admin</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">System Controller</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'inventory', icon: BookOpen, label: 'Book Inventory' },
            { id: 'users', icon: Users, label: 'User Management' },
            { id: 'circulation', icon: Clock, label: 'Circulation' },
            { id: 'events', icon: Calendar, label: 'Library Events' },
            { id: 'reports', icon: FileText, label: 'Reports & Analytics' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((item, idx) => (
            <button
              key={`admin-sidebar-${item.id}-${idx}`}
              onClick={() => setActiveMenu(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeMenu === item.id 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <item.icon size={18} className={activeMenu === item.id ? 'text-blue-600' : 'text-slate-400'} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 bg-slate-200 rounded-full overflow-hidden">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="Admin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">Admin User</p>
              <p className="text-xs text-slate-500 truncate">Head Librarian</p>
            </div>
            <button onClick={handleAdminLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
          <h2 className="text-lg font-bold text-slate-900">HKMU</h2>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="relative hidden md:block">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search the archive..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <div className="relative">
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="hover:text-slate-600 transition-colors relative"
                >
                  <Bell size={20} />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                </button>
                
                <AnimatePresence>
                  {isNotificationsOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-900">Notifications</h3>
                        {notifications.length > 0 && (
                          <button onClick={handleMarkAllRead} className="text-xs text-blue-600 font-bold hover:underline">Mark all read</button>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? notifications.map((n: any, idx: number) => (
                          <div key={`admin-notif-${n.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 cursor-pointer">
                            <div className="flex gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.color}`}>
                                <n.icon size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900">{n.title}</p>
                                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.desc}</p>
                                <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                              </div>
                            </div>
                          </div>
                        )) : (
                          <div className="p-8 text-center text-slate-500 text-sm">
                            {t.noNotifications || "No notifications"}
                          </div>
                        )}
                      </div>
                      <div className="p-3 text-center border-t border-slate-100">
                        <button className="text-sm text-slate-500 font-medium hover:text-slate-900 transition-colors">View all notifications</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative flex items-center gap-4">
                <button 
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="hover:text-slate-600 transition-colors"
                >
                  <Settings size={20} />
                </button>
                <button 
                  onClick={handleAdminLogout}
                  className="hover:text-red-600 transition-colors"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>

                <AnimatePresence>
                  {isSettingsOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900">Admin Settings</h3>
                      </div>
                      <div className="p-2">
                        {[
                          { icon: User, label: 'Profile Settings' },
                          { icon: Lock, label: 'Security & Privacy' },
                          { icon: Bell, label: 'Notification Preferences' },
                          { icon: Building2, label: 'Library Information' },
                        ].map((item, i) => (
                          <button 
                            key={`admin-setting-${i}`}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all"
                          >
                            <item.icon size={18} className="text-slate-400" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <div className="p-2 border-t border-slate-100">
                        <button 
                          onClick={handleAdminLogout}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <LogOut size={18} />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden bg-white border-t border-slate-200 flex items-center justify-around p-3 pb-safe">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
            { id: 'inventory', icon: BookOpen, label: 'Books' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'circulation', icon: Clock, label: 'Circ' },
          ].map((item, idx) => (
            <button 
              key={`admin-nav-${item.id}-${idx}`}
              onClick={() => setActiveMenu(item.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                activeMenu === item.id ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Book Modal */}
      <AnimatePresence>
        {isBookModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
              onClick={() => setIsBookModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingBook ? 'Edit Book' : 'Add New Book'}
                </h3>
                <button onClick={() => setIsBookModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <Trash2 size={20} className="hidden" /> {/* Placeholder for close icon if needed, using click outside for now */}
                  Close
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <form id="book-form" onSubmit={handleSaveBook} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">English Details</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title (EN)</label>
                        <input required type="text" value={bookForm.titleEn} onChange={e => setBookForm({...bookForm, titleEn: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Author (EN)</label>
                        <input required type="text" value={bookForm.authorEn} onChange={e => setBookForm({...bookForm, authorEn: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description (EN)</label>
                        <textarea required value={bookForm.descriptionEn} onChange={e => setBookForm({...bookForm, descriptionEn: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none h-24 resize-none" />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Chinese Details</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title (ZH)</label>
                        <input required type="text" value={bookForm.titleZh} onChange={e => setBookForm({...bookForm, titleZh: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Author (ZH)</label>
                        <input required type="text" value={bookForm.authorZh} onChange={e => setBookForm({...bookForm, authorZh: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description (ZH)</label>
                        <textarea required value={bookForm.descriptionZh} onChange={e => setBookForm({...bookForm, descriptionZh: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none h-24 resize-none" />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-6 grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select value={bookForm.category} onChange={e => setBookForm({...bookForm, category: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none">
                        <option value="catPhilosophy">Philosophy</option>
                        <option value="catModernLiterature">Modern Literature</option>
                        <option value="catScienceFiction">Science Fiction</option>
                        <option value="catHistory">History</option>
                        <option value="catDesign">Design</option>
                        <option value="catTechnology">Technology</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Cover Image URL</label>
                      <input type="url" value={bookForm.cover} onChange={e => setBookForm({...bookForm, cover: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" placeholder="https://..." />
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Storage Location</label>
                        <input type="text" value={bookForm.storageLocation} onChange={e => setBookForm({...bookForm, storageLocation: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" placeholder="e.g. Aisle 04 / Shelf B-12" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Total Quantity</label>
                        <input required type="number" min="1" value={bookForm.quantity} onChange={e => setBookForm({...bookForm, quantity: parseInt(e.target.value) || 1})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsBookModalOpen(false)} className="px-6 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" form="book-form" className="px-6 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
                  Save Book
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Modal */}
      <AnimatePresence>
        {isEventModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
              onClick={() => setIsEventModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingEvent ? 'Edit Event' : 'Add New Event'}
                </h3>
                <button onClick={() => setIsEventModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  Close
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <form id="event-form" onSubmit={handleSaveEvent} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">English Details</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title (EN)</label>
                        <input required type="text" value={eventForm.titleEn} onChange={e => setEventForm({...eventForm, titleEn: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Location (EN)</label>
                        <input required type="text" value={eventForm.locationEn} onChange={e => setEventForm({...eventForm, locationEn: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Chinese Details</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title (ZH)</label>
                        <input required type="text" value={eventForm.titleZh} onChange={e => setEventForm({...eventForm, titleZh: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Location (ZH)</label>
                        <input required type="text" value={eventForm.locationZh} onChange={e => setEventForm({...eventForm, locationZh: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-6 grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input required type="text" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" placeholder="e.g. 15 Oct 2026" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                      <input required type="text" value={eventForm.time} onChange={e => setEventForm({...eventForm, time: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" placeholder="e.g. 14:00 - 16:00" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select value={eventForm.category} onChange={e => setEventForm({...eventForm, category: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none">
                        <option value="eventWorkshop">Workshop</option>
                        <option value="eventReading">Reading</option>
                        <option value="eventExhibition">Exhibition</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
                      <input type="url" value={eventForm.image} onChange={e => setEventForm({...eventForm, image: e.target.value})} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none" placeholder="https://..." />
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsEventModalOpen(false)} className="px-6 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" form="event-form" className="px-6 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
                  Save Event
                </button>
              </div>
            </motion.div>
          </div>
        )}
        <AnimatePresence>
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </AnimatePresence>

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
      </AnimatePresence>
    </div>
  );
};
