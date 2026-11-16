import React, { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle2, ListFilter, Search } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { apiRequest } from './api/client';
import LoginPage from './components/LoginPage';
import Navbar from './components/Navbar';
import StatsBar from './components/StatsBar';
import ComposeModal from './components/ComposeModal';
import EmailTable from './components/EmailTable';
import EmailDetailModal from './components/EmailDetailModal';

export default function App() {
  const { user, loading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('scheduled'); // 'scheduled' | 'sent' | 'all'
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);
  const [queueInfo, setQueueInfo] = useState(null);
  const [etherealInfo, setEtherealInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState(null);

  const fetchDashboardData = useCallback(async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setRefreshing(true);
    try {
      const data = await apiRequest('/emails?filter=all');
      setEmails(data.emails || []);
      setStats(data.stats || null);
      setQueueInfo(data.queue || null);
      setEtherealInfo(data.ethereal || null);
    } catch (err) {
      console.error('Failed to load dashboard data:', err.message);
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, [user]);

  // Poll every 3 seconds so scheduled emails transition to Sent live on screen
  useEffect(() => {
    if (!user) return;
    fetchDashboardData(true);
    const timer = setInterval(() => {
      fetchDashboardData(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [user, fetchDashboardData]);

  const showToast = (text, type = 'success') => {
    setBannerMessage({ text, type });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleScheduleEmail = async (payload) => {
    const res = await apiRequest('/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast(res.message || 'Email scheduled!');
    setActiveTab('scheduled');
    await fetchDashboardData(false);
  };

  const handleSimulateBulk = async () => {
    setBulkLoading(true);
    try {
      const res = await apiRequest('/emails/bulk-demo', {
        method: 'POST',
        body: JSON.stringify({ count: 12, delaySeconds: 8 }),
      });
      showToast(res.message);
      setActiveTab('scheduled');
      await fetchDashboardData(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSendNow = async (id) => {
    try {
      const res = await apiRequest(`/emails/${id}/send-now`, { method: 'POST' });
      showToast(res.message);
      await fetchDashboardData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCancel = async (id) => {
    try {
      const res = await apiRequest(`/emails/${id}/cancel`, { method: 'POST' });
      showToast(res.message);
      await fetchDashboardData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`/emails/${id}`, { method: 'DELETE' });
      showToast('Email record removed.');
      await fetchDashboardData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading Outbox Scheduler...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Filter emails by active tab and search query
  const filteredEmails = emails.filter((item) => {
    if (activeTab === 'scheduled' && !['PENDING', 'PROCESSING'].includes(item.status)) {
      return false;
    }
    if (activeTab === 'sent' && !['SENT', 'FAILED', 'CANCELLED'].includes(item.status)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.recipient.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const scheduledCount = (stats?.pending ?? 0) + (stats?.processing ?? 0);
  const sentCount = (stats?.sent ?? 0) + (stats?.failed ?? 0) + (stats?.cancelled ?? 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        user={user}
        ethereal={etherealInfo}
        queueConfig={queueInfo?.config}
        onOpenCompose={() => setIsComposeOpen(true)}
        onSimulateBulk={handleSimulateBulk}
        onRefresh={() => fetchDashboardData(true)}
        refreshing={refreshing}
        bulkLoading={bulkLoading}
        onLogout={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {bannerMessage && (
          <div
            className={`mb-5 px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              bannerMessage.type === 'error'
                ? 'bg-rose-950/70 border-rose-800 text-rose-200'
                : 'bg-indigo-950/70 border-indigo-800 text-indigo-200'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-slate-400 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Metrics Summary Cards */}
        <StatsBar stats={stats} queueCounts={queueInfo?.counts} />

        {/* Tabs & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('scheduled')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                activeTab === 'scheduled'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Scheduled (Pending)</span>
              <span className="px-1.5 py-0.5 text-[11px] rounded-full bg-slate-950/50">
                {scheduledCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sent')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                activeTab === 'sent'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Sent Emails</span>
              <span className="px-1.5 py-0.5 text-[11px] rounded-full bg-slate-950/50">
                {sentCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>All ({stats?.total ?? 0})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipient, subject, body..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Emails Table */}
        <EmailTable
          emails={filteredEmails}
          activeTab={activeTab}
          onSendNow={handleSendNow}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onSelectEmail={setSelectedEmail}
        />
      </main>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSchedule={handleScheduleEmail}
      />

      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}
