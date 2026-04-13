import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Users, LayoutDashboard, Settings, 
  LogOut, Plus, Edit2, Trash2, Search, Bell, 
  Filter, ChevronLeft, ChevronRight, CheckCircle2,
  AlertCircle, Clock, MapPin, Download, FileText
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

// Types
// Assuming these are passed or imported
export const AdminDashboard = ({ 
  books, 
  requests,
  onLogout,
  t,
  language
}: any) => {
  const [activeMenu, setActiveMenu] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedUsers: any[] = [];
      snapshot.forEach(doc => {
        fetchedUsers.push(doc.data());
      });
      setUsers(fetchedUsers);
    });
    return () => unsubscribe();
  }, []);
  
  // Book CRUD state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);
  const [bookForm, setBookForm] = useState({
    titleEn: '',
    titleZh: '',
    authorEn: '',
    authorZh: '',
    category: 'catPhilosophy',
    cover: '',
    descriptionEn: '',
    descriptionZh: ''
  });

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
        descriptionZh: book.description?.['zh-HK'] || ''
      });
    } else {
      setEditingBook(null);
      setBookForm({
        titleEn: '', titleZh: '', authorEn: '', authorZh: '',
        category: 'catPhilosophy', cover: '', descriptionEn: '', descriptionZh: ''
      });
    }
    setIsBookModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const bookData = {
        title: { en: bookForm.titleEn, 'zh-HK': bookForm.titleZh },
        author: { en: bookForm.authorEn, 'zh-HK': bookForm.authorZh },
        category: bookForm.category,
        cover: bookForm.cover,
        description: { en: bookForm.descriptionEn, 'zh-HK': bookForm.descriptionZh },
        updatedAt: serverTimestamp()
      };

      if (editingBook) {
        await updateDoc(doc(db, 'books', editingBook.id), bookData);
      } else {
        const newDocRef = doc(collection(db, 'books'));
        await setDoc(newDocRef, {
          ...bookData,
          id: newDocRef.id,
          createdAt: serverTimestamp()
        });
      }
      setIsBookModalOpen(false);
    } catch (error) {
      console.error("Error saving book:", error);
      alert("Failed to save book");
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this book?")) {
      try {
        await deleteDoc(doc(db, 'books', id));
      } catch (error) {
        console.error("Error deleting book:", error);
        alert("Failed to delete book");
      }
    }
  };

  const [userSearchQuery, setUserSearchQuery] = useState('');

  const handleToggleRole = async (userId: string, currentRole: string) => {
    if (window.confirm(`Are you sure you want to change this user's role to ${currentRole === 'admin' ? 'user' : 'admin'}?`)) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          role: currentRole === 'admin' ? 'user' : 'admin'
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        alert("Failed to update user role");
      }
    }
  };

  const renderContent = () => {
    switch (activeMenu) {
      case 'inventory':
        return (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Book Inventory</h2>
                <p className="text-slate-500">Manage the digital footprint of your physical collection.</p>
              </div>
              <button 
                onClick={() => handleOpenBookModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={20} />
                Add New Book
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
                    {books.map((book: any) => (
                      <tr key={book.id} className="hover:bg-slate-50/50 transition-colors group">
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
                            Aisle 04 / Shelf B-12
                          </div>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleOpenBookModal(book)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteBook(book.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                {books.map((book: any) => (
                  <div key={book.id} className="p-4 space-y-4">
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
                        Aisle 04 / Shelf B-12
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
                <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
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
                    {filteredUsers.map((user: any) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
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
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                {filteredUsers.map((user: any) => (
                  <div key={user.id} className="p-4 space-y-4">
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
                <h2 className="text-2xl font-bold text-slate-900">Dashboard Overview</h2>
                <p className="text-slate-500 mt-1 text-sm md:text-base">System status and quick metrics.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <BookOpen size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">{books.length}</p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">Total Books</p>
                </div>
              </div>

              <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Users size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">{users.length}</p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">Total Members</p>
                </div>
              </div>

              <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-amber-50 text-amber-600 rounded-xl">
                    <AlertCircle size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">
                    {requests?.filter((r: any) => r.status === 'pending').length || 0}
                  </p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">Pending Requests</p>
                </div>
              </div>

              <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 md:p-3 bg-purple-50 text-purple-600 rounded-xl">
                    <Clock size={20} className="md:w-6 md:h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">
                    {requests?.filter((r: any) => r.status === 'approved' && r.type === 'borrow').length || 0}
                  </p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">Active Borrows</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  {requests?.slice(0, 5).map((req: any) => (
                    <div key={req.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className={`w-2 h-2 rounded-full ${req.status === 'pending' ? 'bg-amber-500' : req.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {req.type === 'borrow' ? 'Borrow Request' : req.type === 'return' ? 'Return Request' : 'Renewal Request'}
                        </p>
                        <p className="text-xs text-slate-500">{new Date(req.date).toLocaleDateString()}</p>
                      </div>
                      <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded-md uppercase tracking-wider text-slate-600">
                        {req.status}
                      </span>
                    </div>
                  ))}
                  {(!requests || requests.length === 0) && (
                    <p className="text-sm text-slate-500 text-center py-4">No recent activity.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'circulation':
      case 'reports':
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
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-600">Archive Admin</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">System Controller</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'inventory', icon: BookOpen, label: 'Book Inventory' },
            { id: 'users', icon: Users, label: 'User Management' },
            { id: 'circulation', icon: Clock, label: 'Circulation' },
            { id: 'reports', icon: FileText, label: 'Reports & Analytics' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map(item => (
            <button
              key={item.id}
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
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <h2 className="text-lg font-bold text-slate-900">The Curated Archive</h2>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search the archive..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <button className="hover:text-slate-600 transition-colors"><Bell size={20} /></button>
              <button className="hover:text-slate-600 transition-colors"><Settings size={20} /></button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
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
    </div>
  );
};
