'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/store/useAuthStore';
import { 
  useSessionHistory, 
  useCreateSession, 
  useSessionDetails, 
  useUpdateSession, 
  useDeleteSession, 
  useAiCopilot 
} from '../../lib/hooks/useSessions';
import { 
  Video, LogOut, Copy, Check, Plus, ExternalLink, Calendar, 
  Users, ShieldAlert, Clock, BarChart3, AlertCircle, Shield, 
  HelpCircle, ChevronRight, Activity, Tag, Star, X, Trash2, 
  Brain, Sparkles, MessageSquare, Settings, User, Mail, FileText
} from 'lucide-react';

export default function AgentDashboard() {
  const router = useRouter();
  const { token, user, logout, isAuthenticated } = useAuthStore();
  const { data: sessions, isLoading, refetch } = useSessionHistory();
  const createMutation = useCreateSession();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TECHNICAL_SUPPORT');
  const [severity, setSeverity] = useState('MEDIUM');
  const [department, setDepartment] = useState('TECHNICAL_SUPPORT');
  const [assignedTeam, setAssignedTeam] = useState('');

  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Dynamic dashboard states
  const [activeMetricFilter, setActiveMetricFilter] = useState<'ALL' | 'RESOLVED' | 'ESCALATED' | 'RATED'>('ALL');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Dynamic details fetching
  const { data: selectedSession, isLoading: isDetailsLoading, refetch: refetchDetails } = useSessionDetails(selectedSessionId || '');
  
  // Custom mutations
  const updateMutation = useUpdateSession();
  const deleteMutation = useDeleteSession();
  const aiCopilotMutation = useAiCopilot();

  // Edit fields for detail modal
  const [editCategory, setEditCategory] = useState('TECHNICAL_SUPPORT');
  const [editSeverity, setEditSeverity] = useState('MEDIUM');
  const [editDepartment, setEditDepartment] = useState('TECHNICAL_SUPPORT');
  const [editStatus, setEditStatus] = useState('CREATED');
  const [editNotes, setEditNotes] = useState('');
  const [editResolutionStatus, setEditResolutionStatus] = useState('NO_RESPONSE');

  // Load selected session details into edit states
  useEffect(() => {
    if (selectedSession) {
      setEditCategory(selectedSession.category || 'TECHNICAL_SUPPORT');
      setEditSeverity(selectedSession.severity || 'MEDIUM');
      setEditDepartment(selectedSession.department || 'TECHNICAL_SUPPORT');
      setEditStatus(selectedSession.status || 'CREATED');
      setEditNotes(selectedSession.agentNotes || '');
      setEditResolutionStatus(selectedSession.resolutionStatus || 'NO_RESPONSE');
    }
  }, [selectedSession]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createMutation.mutate(
      { title, description, category, severity, department, assignedTeam },
      {
        onSuccess: (data) => {
          setTitle('');
          setDescription('');
          setCategory('TECHNICAL_SUPPORT');
          setSeverity('MEDIUM');
          setDepartment('TECHNICAL_SUPPORT');
          setAssignedTeam('');
          setModalOpen(false);
          refetch();
          router.push(`/session/${data.session.id}`);
        },
      }
    );
  };

  const copyToClipboard = (token: string, sessionId: string) => {
    const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInviteId(sessionId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  };

  if (isLoading || !user) {
    return (
      <div className="flex-1 min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 font-semibold flex items-center gap-3">
          <ActivitySpinner /> Loading Support Portal...
        </div>
      </div>
    );
  }

  // Filter active and completed sessions
  const activeSessions = sessions?.filter((s: any) =>
    ['CREATED', 'WAITING', 'ACTIVE', 'RECORDING', 'AGENT_DISCONNECTED', 'CUSTOMER_DISCONNECTED', 'RECONNECTING'].includes(s.status)
  ) || [];

  const completedSessions = sessions?.filter((s: any) =>
    ['ENDED', 'ABANDONED'].includes(s.status)
  ) || [];

  // Filter based on activeMetricFilter
  const filteredActiveSessions = activeSessions.filter((s: any) => {
    if (activeMetricFilter === 'ALL') return true;
    if (activeMetricFilter === 'RESOLVED') return s.resolutionStatus === 'RESOLVED';
    if (activeMetricFilter === 'ESCALATED') return s.severity === 'CRITICAL' || s.severity === 'HIGH' || s.department === 'ESCALATIONS' || s.resolutionStatus === 'ESCALATED';
    if (activeMetricFilter === 'RATED') return s.feedbackRating !== null && s.feedbackRating !== undefined;
    return true;
  });

  const filteredCompletedSessions = completedSessions.filter((s: any) => {
    if (activeMetricFilter === 'ALL') return true;
    if (activeMetricFilter === 'RESOLVED') return s.resolutionStatus === 'RESOLVED';
    if (activeMetricFilter === 'ESCALATED') return s.resolutionStatus === 'ESCALATED';
    if (activeMetricFilter === 'RATED') return s.feedbackRating !== null && s.feedbackRating !== undefined;
    return true;
  });

  // Calculate Operational Metrics Ribbon
  const totalCases = sessions?.length || 0;
  const resolvedCases = sessions?.filter((s: any) => s.resolutionStatus === 'RESOLVED').length || 0;
  const escalatedCases = sessions?.filter((s: any) => s.resolutionStatus === 'ESCALATED').length || 0;
  
  const ratedSessions = sessions?.filter((s: any) => s.feedbackRating !== null && s.feedbackRating !== undefined) || [];
  const averageSatisfaction = ratedSessions.length > 0
    ? (ratedSessions.reduce((sum: number, s: any) => sum + s.feedbackRating, 0) / ratedSessions.length).toFixed(1)
    : 'N/A';

  const departmentsList = [
    { key: 'TECHNICAL_SUPPORT', label: 'Technical Support', color: 'border-violet-500/20 text-violet-400 bg-violet-500/5' },
    { key: 'BILLING', label: 'Billing & Invoices', color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' },
    { key: 'ACCOUNT_RECOVERY', label: 'Account Recovery', color: 'border-amber-500/20 text-amber-400 bg-amber-500/5' },
    { key: 'SALES', label: 'Sales & Demo', color: 'border-sky-500/20 text-sky-400 bg-sky-500/5' },
    { key: 'ESCALATIONS', label: 'Escalations Queue', color: 'border-red-500/20 text-red-400 bg-red-500/5' },
  ];

  return (
    <div className="flex-1 min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-950/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-950/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-xl">
            <Video className="w-5 h-5" />
          </div>
          <span className="font-['Outfit'] text-xl font-bold tracking-tight text-slate-100">
            SupportStream
          </span>
        </div>

        <div className="flex items-center gap-6">
          {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400 font-semibold text-sm hover:bg-violet-600/20 transition flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" /> Operations Control
            </button>
          )}

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-200">{user.displayName}</p>
              <p className="text-xs text-slate-500 font-medium capitalize">{user.role.toLowerCase()}</p>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/');
              }}
              className="p-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-8 py-8 flex flex-col gap-8 relative z-10">
        
        {/* Operational Metrics Ribbon */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setActiveMetricFilter('ALL')}
            className={`p-4 rounded-2xl border flex items-center gap-4 transition duration-200 text-left relative overflow-hidden group ${
              activeMetricFilter === 'ALL'
                ? 'border-violet-500 bg-violet-600/10 shadow-lg shadow-violet-600/5 scale-[1.02]'
                : 'border-slate-900 bg-slate-950/40 hover:border-slate-800 hover:bg-slate-900/10'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 transition ${
              activeMetricFilter === 'ALL'
                ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300'
                : 'bg-violet-500/10 border border-violet-500/20 text-violet-400'
            }`}>
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Support Cases</p>
              <p className="font-['Outfit'] text-2xl font-extrabold text-slate-100">{totalCases}</p>
            </div>
            {activeMetricFilter === 'ALL' && (
              <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
            )}
          </button>

          <button
            onClick={() => setActiveMetricFilter('RESOLVED')}
            className={`p-4 rounded-2xl border flex items-center gap-4 transition duration-200 text-left relative overflow-hidden group ${
              activeMetricFilter === 'RESOLVED'
                ? 'border-emerald-500 bg-emerald-600/10 shadow-lg shadow-emerald-600/5 scale-[1.02]'
                : 'border-slate-900 bg-slate-950/40 hover:border-slate-800 hover:bg-slate-900/10'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 transition ${
              activeMetricFilter === 'RESOLVED'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Resolved Cases</p>
              <p className="font-['Outfit'] text-2xl font-extrabold text-slate-100">{resolvedCases}</p>
            </div>
            {activeMetricFilter === 'RESOLVED' && (
              <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            )}
          </button>

          <button
            onClick={() => setActiveMetricFilter('ESCALATED')}
            className={`p-4 rounded-2xl border flex items-center gap-4 transition duration-200 text-left relative overflow-hidden group ${
              activeMetricFilter === 'ESCALATED'
                ? 'border-red-500 bg-red-600/10 shadow-lg shadow-red-600/5 scale-[1.02]'
                : 'border-slate-900 bg-slate-950/40 hover:border-slate-800 hover:bg-slate-900/10'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 transition ${
              activeMetricFilter === 'ESCALATED'
                ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Escalated Cases</p>
              <p className="font-['Outfit'] text-2xl font-extrabold text-slate-100">{escalatedCases}</p>
            </div>
            {activeMetricFilter === 'ESCALATED' && (
              <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            )}
          </button>

          <button
            onClick={() => setActiveMetricFilter('RATED')}
            className={`p-4 rounded-2xl border flex items-center gap-4 transition duration-200 text-left relative overflow-hidden group ${
              activeMetricFilter === 'RATED'
                ? 'border-yellow-500 bg-yellow-600/10 shadow-lg shadow-yellow-600/5 scale-[1.02]'
                : 'border-slate-900 bg-slate-950/40 hover:border-slate-800 hover:bg-slate-900/10'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 transition ${
              activeMetricFilter === 'RATED'
                ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-300'
                : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
            }`}>
              <Star className="w-5 h-5 fill-yellow-400/20 text-yellow-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Satisfaction Rating</p>
              <p className="font-['Outfit'] text-2xl font-extrabold text-slate-100">{averageSatisfaction} <span className="text-xs text-slate-500 font-semibold">/ 5</span></p>
            </div>
            {activeMetricFilter === 'RATED' && (
              <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
            )}
          </button>
        </section>

        {/* Section Header */}
        <div className="flex justify-between items-center shrink-0">
          <div>
            <h2 className="font-['Outfit'] text-2xl font-extrabold text-slate-100">Live Support Queue Control</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage live support call rooms routed by specialized department columns.</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold text-sm transition flex items-center gap-2 shadow-lg shadow-violet-600/15"
          >
            <Plus className="w-4 h-4" /> Create Support Room
          </button>
        </div>

        {/* Layout Grid */}
        <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
          
          {/* Left Side: Department Queue Columns */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
              {departmentsList.map((dept) => {
                const deptSessions = filteredActiveSessions.filter((s: any) => s.department === dept.key);

                return (
                  <div key={dept.key} className="flex flex-col h-[600px] rounded-2xl border border-slate-900 bg-slate-950/20 overflow-hidden">
                    {/* Header */}
                    <div className={`p-4 border-b border-slate-900 shrink-0 flex items-center justify-between ${dept.color}`}>
                      <span className="font-bold text-xs tracking-wide uppercase">{dept.label}</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900/60 border border-white/5">
                        {deptSessions.length}
                      </span>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-0 bg-slate-950/5">
                      {deptSessions.length === 0 ? (
                        <div className="h-full flex flex-col justify-center items-center text-center p-4">
                          <HelpCircle className="w-6 h-6 text-slate-700 mb-2" />
                          <p className="text-[11px] text-slate-600 font-semibold uppercase">Queue Empty</p>
                        </div>
                      ) : (
                        deptSessions.map((session: any) => {
                          const activeInvite = session.invites?.find((i: any) => !i.isRevoked);
                          const isCopied = copiedInviteId === session.id;

                          return (
                            <div 
                              key={session.id} 
                              onClick={() => { setSelectedSessionId(session.id); setDetailModalOpen(true); }}
                              className="cursor-pointer p-4 rounded-xl border border-slate-900 bg-slate-950/40 hover:border-violet-500/30 hover:bg-slate-900/20 transition duration-150 flex flex-col gap-3 group relative overflow-hidden"
                            >
                              {/* Severity Badge */}
                              <div className="flex justify-between items-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${getSeverityClass(session.severity)}`}>
                                  {session.severity}
                                </span>
                                <span className="text-[10px] text-slate-600 font-semibold">{session.ticketRef}</span>
                              </div>

                              <div>
                                <h4 className="font-bold text-slate-300 text-sm group-hover:text-violet-400 transition truncate">{session.title}</h4>
                                <p className="text-slate-600 text-xs line-clamp-2 mt-1 leading-relaxed">{session.description || 'No description.'}</p>
                              </div>

                              <div className="pt-2 border-t border-slate-900 flex flex-col gap-2">
                                {activeInvite && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(activeInvite.token, session.id); }}
                                    className="w-full py-1.5 rounded-lg border border-slate-900 hover:border-slate-800 bg-slate-950 text-[10px] text-slate-400 hover:text-slate-200 transition font-bold flex items-center justify-center gap-1.5"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" /> Copy Invite Link
                                      </>
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/session/${session.id}`); }}
                                  className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-slate-100 text-[10px] font-bold transition flex items-center justify-center gap-1"
                                >
                                  Launch Room <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side: Historical Logs Sidebar */}
          <aside className="w-full lg:w-[350px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-900 lg:pl-8 flex flex-col h-[600px] overflow-hidden">
            <h3 className="font-['Outfit'] text-lg font-bold text-slate-100 flex items-center gap-2 shrink-0 mb-4">
              <Clock className="w-4.5 h-4.5 text-slate-500" /> Past Session Resolutions
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
              {filteredCompletedSessions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-900 bg-white/[0.002] rounded-2xl text-xs text-slate-600">
                  No historical entries.
                </div>
              ) : (
                filteredCompletedSessions.map((session: any) => (
                  <div 
                    key={session.id} 
                    onClick={() => { setSelectedSessionId(session.id); setDetailModalOpen(true); }}
                    className="cursor-pointer p-4 rounded-xl border border-slate-900 bg-slate-950/30 hover:border-violet-500/30 hover:bg-slate-900/20 transition flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-300 text-xs truncate max-w-[180px]">{session.title}</h4>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${getResolutionBadgeClass(session.resolutionStatus)}`}>
                        {session.resolutionStatus || session.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-900/40 pt-2">
                      <span>Ref: <span className="text-slate-400 font-semibold">{session.ticketRef}</span></span>
                      <span>Rating: <span className="text-slate-300 font-bold">{session.feedbackRating ? `⭐ ${session.feedbackRating}` : 'None'}</span></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

        </div>

      </main>

      {/* Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg p-6 rounded-2xl glass-panel shadow-2xl relative border border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-violet-400" />
              <h3 className="font-['Outfit'] text-xl font-bold text-slate-100">Launch Support Call Session</h3>
            </div>
            
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Support Issue Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Router Configuration Error"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide ticket details or customer concerns..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition resize-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Support Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm"
                  >
                    <option value="TECHNICAL_SUPPORT">Technical Support</option>
                    <option value="BILLING">Billing & Account</option>
                    <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                    <option value="INSTALLATION">Installation Help</option>
                    <option value="PRODUCT_DEMO">Product Demo</option>
                    <option value="ESCALATION">Escalated Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Issue Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Routing Department Column</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm"
                  >
                    <option value="TECHNICAL_SUPPORT">Technical Support</option>
                    <option value="BILLING">Billing</option>
                    <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                    <option value="SALES">Sales</option>
                    <option value="ESCALATIONS">Escalations</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Assigned Support Team (Optional)</label>
                  <input
                    type="text"
                    value={assignedTeam}
                    onChange={(e) => setAssignedTeam(e.target.value)}
                    placeholder="e.g. Tier 2 Network"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-900 mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 text-sm font-bold transition"
                >
                  {createMutation.isPending ? 'Launching...' : 'Initialize Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & Control Modal */}
      {detailModalOpen && selectedSessionId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-slate-900 bg-slate-950/90 shadow-2xl flex flex-col overflow-hidden relative">
            {/* Glow effect */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Header */}
            <div className="p-6 border-b border-slate-900 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${getSeverityClass(selectedSession?.severity || 'MEDIUM')}`}>
                  {selectedSession?.severity || 'MEDIUM'}
                </span>
                <div>
                  <h3 className="font-['Outfit'] text-lg font-bold text-slate-100 flex items-center gap-2">
                    {selectedSession?.title || 'Loading Session Details...'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ticket Ref: <span className="text-slate-400 font-semibold">{selectedSession?.ticketRef || 'N/A'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setDetailModalOpen(false); setSelectedSessionId(null); aiCopilotMutation.reset(); }}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            {isDetailsLoading || !selectedSession ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-slate-400 font-semibold flex items-center gap-3 text-sm">
                  <ActivitySpinner /> Loading ticket details...
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Details & AI Summary (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  {/* Issue Description */}
                  <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                      {selectedSession.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* AI Copilot & Summary */}
                  <div className="p-5 rounded-xl border border-violet-500/10 bg-violet-500/5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4.5 h-4.5 text-violet-400" />
                        <h4 className="font-bold text-sm text-slate-200">AI Copilot Analysis</h4>
                      </div>
                      <button
                        onClick={() => aiCopilotMutation.mutate(selectedSession.id)}
                        disabled={aiCopilotMutation.isPending}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-[10px] text-slate-100 font-bold transition flex items-center gap-1.5 shadow"
                      >
                        <Sparkles className="w-3 h-3" />
                        {aiCopilotMutation.isPending ? 'Analyzing...' : 'Run AI Copilot'}
                      </button>
                    </div>

                    {aiCopilotMutation.isPending && (
                      <div className="py-8 flex flex-col items-center justify-center gap-3 text-xs text-slate-400">
                        <ActivitySpinner />
                        <span>Transcribing logs & generating timeline insights...</span>
                      </div>
                    )}

                    {aiCopilotMutation.isError && (
                      <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400">
                        Failed to generate AI insights. Make sure the call has chat messages.
                      </div>
                    )}

                    {!aiCopilotMutation.isPending && !aiCopilotMutation.data && (
                      <div className="text-xs text-slate-500 leading-relaxed">
                        Execute the AI Copilot to summarize the call transcript, extract troubleshooting action items, and draft a personalized customer follow-up email.
                      </div>
                    )}

                    {!aiCopilotMutation.isPending && aiCopilotMutation.data && (
                      <div className="space-y-4">
                        <div>
                          <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Troubleshooting Summary</span>
                          <div className="mt-1.5 text-xs text-slate-300 space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-900 whitespace-pre-line leading-relaxed">
                            {aiCopilotMutation.data.summary}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Draft Follow-Up Email</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(aiCopilotMutation.data!.followUpEmail);
                                alert('Email copied to clipboard!');
                              }}
                              className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition"
                            >
                              Copy Email
                            </button>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-300 font-mono bg-slate-950/40 p-3 rounded-lg border border-slate-900 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                            {aiCopilotMutation.data.followUpEmail}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tech Audit & Timeline Log */}
                  <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Call Technical Metrics</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/60">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Total Messages</p>
                        <p className="font-bold text-base text-slate-200 mt-0.5">{selectedSession.summary?.totalMessages || 0}</p>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/60">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Shared Files</p>
                        <p className="font-bold text-base text-slate-200 mt-0.5">{selectedSession.summary?.totalFiles || 0}</p>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/60">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">Duration</p>
                        <p className="font-bold text-base text-slate-200 mt-0.5">
                          {selectedSession.summary?.durationSec
                            ? `${Math.floor(selectedSession.summary.durationSec / 60)}m ${selectedSession.summary.durationSec % 60}s`
                            : '0s'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: CRM, Feedback & Controls (5 cols) */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* Customer CRM Profile */}
                  <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Profile</h4>
                    {(() => {
                      const customer = selectedSession.participants?.find((p: any) => p.role === 'CUSTOMER');
                      if (!customer) {
                        return <p className="text-xs text-slate-600">No customer details recorded in this call.</p>;
                      }
                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-500" />
                            <span className="text-xs text-slate-300 font-semibold">{customer.displayName}</span>
                          </div>
                          {customer.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-slate-500" />
                              <span className="text-xs text-slate-400 font-mono truncate">{customer.email}</span>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Joined: {new Date(customer.joinedAt).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Feedback Report */}
                  {selectedSession.feedbackRating !== null && selectedSession.feedbackRating !== undefined && (
                    <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Customer Feedback</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400">Rating:</span>
                          <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                            {'⭐'.repeat(selectedSession.feedbackRating)}
                            <span className="text-slate-500 font-medium ml-1">({selectedSession.feedbackRating}/5)</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400">Resolved Issue?</span>
                          <span className={`text-xs font-bold ${selectedSession.feedbackResolved ? 'text-emerald-400' : 'text-red-400'}`}>
                            {selectedSession.feedbackResolved ? 'YES' : 'NO'}
                          </span>
                        </div>
                        {selectedSession.feedbackComments && (
                          <div className="mt-2 pt-2 border-t border-slate-900/60">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Comments</span>
                            <p className="text-xs text-slate-300 italic mt-0.5 leading-relaxed bg-slate-950/40 p-2 rounded border border-slate-900">
                              "{selectedSession.feedbackComments}"
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Property Updating Panel */}
                  <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3.5">Manage Session & Route</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Issue Category</label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition"
                        >
                          <option value="TECHNICAL_SUPPORT">Technical Support</option>
                          <option value="BILLING">Billing & Account</option>
                          <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                          <option value="INSTALLATION">Installation Help</option>
                          <option value="PRODUCT_DEMO">Product Demo</option>
                          <option value="ESCALATION">Escalated Priority</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Issue Severity</label>
                          <select
                            value={editSeverity}
                            onChange={(e) => setEditSeverity(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition"
                          >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="CRITICAL">Critical</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Routing Dept</label>
                          <select
                            value={editDepartment}
                            onChange={(e) => setEditDepartment(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition"
                          >
                            <option value="TECHNICAL_SUPPORT">Technical Support</option>
                            <option value="BILLING">Billing</option>
                            <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                            <option value="SALES">Sales</option>
                            <option value="ESCALATIONS">Escalations</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Session State</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition"
                          >
                            <option value="CREATED">Created</option>
                            <option value="WAITING">Waiting</option>
                            <option value="ACTIVE">Active</option>
                            <option value="RECORDING">Recording</option>
                            <option value="AGENT_DISCONNECTED">Agent Disconn.</option>
                            <option value="CUSTOMER_DISCONNECTED">Cust. Disconn.</option>
                            <option value="RECONNECTING">Reconnecting</option>
                            <option value="ENDED">Ended</option>
                            <option value="ABANDONED">Abandoned</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Resolution Status</label>
                          <select
                            value={editResolutionStatus}
                            onChange={(e) => setEditResolutionStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition"
                          >
                            <option value="RESOLVED">Resolved</option>
                            <option value="PARTIALLY_RESOLVED">Partially Res.</option>
                            <option value="ESCALATED">Escalated</option>
                            <option value="NO_RESPONSE">No Response</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Agent Notes</label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Record resolution notes, hardware configs, or debug steps..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-violet-500 transition resize-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          updateMutation.mutate({
                            sessionId: selectedSession.id,
                            category: editCategory,
                            severity: editSeverity,
                            department: editDepartment,
                            status: editStatus,
                            resolutionStatus: editResolutionStatus,
                            agentNotes: editNotes
                          }, {
                            onSuccess: () => {
                              alert('Session properties updated successfully!');
                              refetch();
                              refetchDetails();
                            }
                          });
                        }}
                        disabled={updateMutation.isPending}
                        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-xs text-slate-100 font-bold transition flex items-center justify-center gap-1.5 shadow mt-2"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {updateMutation.isPending ? 'Saving Changes...' : 'Save Routing & Notes'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-900 bg-slate-950/60 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to archive/delete this support session? It will be removed from all active queues.')) {
                      deleteMutation.mutate(selectedSessionId, {
                        onSuccess: () => {
                          setDetailModalOpen(false);
                          setSelectedSessionId(null);
                          refetch();
                        }
                      });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-xs transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteMutation.isPending ? 'Archiving...' : 'Archive / Delete Session'}
                </button>
              </div>

              <div className="flex items-center gap-3">
                {selectedSession && ['CREATED', 'WAITING', 'ACTIVE', 'RECORDING', 'AGENT_DISCONNECTED', 'CUSTOMER_DISCONNECTED', 'RECONNECTING'].includes(selectedSession.status) && (
                  <button
                    onClick={() => {
                      const activeInvite = selectedSession.invites?.find((i: any) => !i.isRevoked);
                      if (activeInvite) {
                        copyToClipboard(activeInvite.token, selectedSession.id);
                      } else {
                        alert('No active invites found for this room.');
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition"
                  >
                    Copy Invite Link
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDetailModalOpen(false);
                    router.push(`/session/${selectedSessionId}`);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 text-xs font-bold transition flex items-center gap-1.5 shadow"
                >
                  <ExternalLink className="w-4 h-4" /> Launch Support Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivitySpinner() {
  return (
    <div className="w-5 h-5 border-2 border-violet-500/25 border-t-violet-500 rounded-full animate-spin" />
  );
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-500/10 border border-red-500/20 text-red-400';
    case 'HIGH':
      return 'bg-amber-500/10 border border-amber-500/20 text-amber-400';
    case 'MEDIUM':
      return 'bg-violet-500/10 border border-violet-500/20 text-violet-400';
    default:
      return 'bg-slate-500/10 border border-slate-500/20 text-slate-400';
  }
}

function getResolutionBadgeClass(status: string): string {
  switch (status) {
    case 'RESOLVED':
      return 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    case 'PARTIALLY_RESOLVED':
      return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400';
    case 'ESCALATED':
      return 'bg-red-500/10 border border-red-500/20 text-red-400';
    default:
      return 'bg-slate-500/10 border border-slate-500/20 text-slate-400';
  }
}
