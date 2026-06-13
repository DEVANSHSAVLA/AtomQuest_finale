'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/store/useAuthStore';
import { 
  useSessionHistory, 
  useWorkflowRules, 
  useCreateWorkflowRule, 
  useToggleWorkflowRule, 
  useDeleteWorkflowRule, 
  useIntegrationLogs, 
  useWebhookEvents 
} from '../../lib/hooks/useSessions';
import {
  ShieldAlert, Activity, Users, Radio, Database,
  ArrowLeft, Terminal, Play, Video, Search, AlertCircle,
  Settings, Trash2, Plus, RefreshCw, CheckCircle2, XCircle, 
  Info, Star, BarChart3, HelpCircle, ToggleLeft, ToggleRight,
  ShieldAlert as EscalatedIcon
} from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string | null;
  sessionId: string | null;
  action: string;
  payload: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function OperationsDashboard() {
  const router = useRouter();
  const { token, user, isAuthenticated } = useAuthStore();
  const { data: sessions, isLoading, refetch } = useSessionHistory();

  // Custom workflow query/mutation bindings
  const { data: workflows, refetch: refetchWorkflows } = useWorkflowRules();
  const createWorkflowMutation = useCreateWorkflowRule();
  const toggleWorkflowMutation = useToggleWorkflowRule();
  const deleteWorkflowMutation = useDeleteWorkflowRule();
  const { data: integrationLogs, refetch: refetchIntLogs } = useIntegrationLogs();
  const { data: webhookEvents, refetch: refetchWebhooks } = useWebhookEvents();

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'audits' | 'workflows'>('sessions');

  // New Workflow Rule states
  const [newTrigger, setNewTrigger] = useState('SESSION_ENDED');
  const [newAction, setNewAction] = useState('POST_TO_WEBHOOK');

  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

  // Auth Guard: Admin access only
  useEffect(() => {
    if (!isAuthenticated() || !user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, user, router]);

  // Fetch Audit Logs on tab mount
  useEffect(() => {
    if (activeTab === 'audits') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/sessions/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        const mockAudits: AuditLog[] = [];
        data.data.forEach((s: any) => {
          mockAudits.push({
            id: s.id + '-created',
            userId: s.createdBy,
            sessionId: s.id,
            action: 'SESSION_CREATED',
            payload: { title: s.title },
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
            createdAt: s.createdAt,
          });
          if (s.status === 'ENDED' && s.endedAt) {
            mockAudits.push({
              id: s.id + '-ended',
              userId: s.createdBy,
              sessionId: s.id,
              action: 'SESSION_ENDED',
              payload: { duration: s.summary?.durationSec },
              ipAddress: '127.0.0.1',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
              createdAt: s.endedAt,
            });
          }
        });
        setAuditLogs(mockAudits.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleRemoteTerminate = async (sessionId: string) => {
    if (!confirm('Are you sure you want to remotely terminate this active call room?')) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ resolutionStatus: 'NO_RESPONSE', agentNotes: 'Remotely terminated by administrator.' })
      });
      const data = await response.json();
      if (data.success) {
        refetch();
        alert('Call room terminated successfully.');
      }
    } catch (err: any) {
      alert(err.message || 'Termination failed');
    }
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    createWorkflowMutation.mutate({ trigger: newTrigger, action: newAction }, {
      onSuccess: () => {
        refetchWorkflows();
      }
    });
  };

  const handleToggleRule = (id: string, currentEnabled: boolean) => {
    toggleWorkflowMutation.mutate({ id, enabled: !currentEnabled }, {
      onSuccess: () => {
        refetchWorkflows();
      }
    });
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm('Delete this workflow rule?')) return;
    deleteWorkflowMutation.mutate(id, {
      onSuccess: () => {
        refetchWorkflows();
      }
    });
  };

  if (isLoading || !user) {
    return (
      <div className="flex-1 min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 font-semibold flex items-center gap-3">
          <ActivitySpinner /> Loading Control Dashboard...
        </div>
      </div>
    );
  }

  // Calculate metrics
  const activeSessions = sessions?.filter((s: any) =>
    ['CREATED', 'WAITING', 'ACTIVE', 'RECORDING', 'AGENT_DISCONNECTED', 'CUSTOMER_DISCONNECTED', 'RECONNECTING'].includes(s.status)
  ) || [];

  const completedSessions = sessions?.filter((s: any) => s.status === 'ENDED' || s.status === 'ABANDONED') || [];
  
  // Average Rating
  const ratedSessions = sessions?.filter((s: any) => s.feedbackRating !== null && s.feedbackRating !== undefined) || [];
  const avgRating = ratedSessions.length > 0
    ? (ratedSessions.reduce((sum: number, s: any) => sum + s.feedbackRating, 0) / ratedSessions.length).toFixed(1)
    : 'N/A';

  // Resolved Rate
  const resolvedCount = sessions?.filter((s: any) => s.resolutionStatus === 'RESOLVED').length || 0;
  const resolvedRate = completedSessions.length > 0
    ? ((resolvedCount / completedSessions.length) * 100).toFixed(0) + '%'
    : '0%';

  // Escalation count
  const escalatedCount = sessions?.filter((s: any) => s.resolutionStatus === 'ESCALATED').length || 0;

  return (
    <div className="flex-1 min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Background glow blur */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-900/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 border-l border-slate-900 pl-4">
            <ShieldAlert className="w-5 h-5 text-violet-400" />
            <span className="font-['Outfit'] text-xl font-bold tracking-tight text-slate-100">
              Operations Control Dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-200">{user.displayName}</p>
            <p className="text-xs text-violet-400 font-bold tracking-wider uppercase">{user.role}</p>
          </div>
        </div>
      </header>

      {/* Analytics Cards Grid */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-8 py-10 space-y-8 relative z-10 flex flex-col">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/30 glass-card">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Concurrent Rooms</span>
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <p className="font-['Outfit'] text-3xl font-extrabold text-slate-100">{activeSessions.length}</p>
            <p className="text-slate-600 text-xs mt-1">Real-time concurrent calls</p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/30 glass-card">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Resolved Rate</span>
              <CheckCircle2 className="w-5 h-5 text-violet-400" />
            </div>
            <p className="font-['Outfit'] text-3xl font-extrabold text-slate-100">{resolvedRate}</p>
            <p className="text-slate-600 text-xs mt-1">{resolvedCount} of {completedSessions.length} cases resolved</p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/30 glass-card">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Customer Star Avg</span>
              <Star className="w-5 h-5 fill-yellow-400/20 text-yellow-400" />
            </div>
            <p className="font-['Outfit'] text-3xl font-extrabold text-slate-100">{avgRating} <span className="text-xs text-slate-500">/ 5</span></p>
            <p className="text-slate-600 text-xs mt-1">From {ratedSessions.length} feedback submittals</p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/30 glass-card">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Critical Escalations</span>
              <EscalatedIcon className="w-5 h-5 text-red-500" />
            </div>
            <p className="font-['Outfit'] text-3xl font-extrabold text-slate-100">{escalatedCount}</p>
            <p className="text-slate-600 text-xs mt-1">Escalated case status counter</p>
          </div>
        </section>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-900 gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`pb-4 text-sm font-semibold border-b-2 transition ${
              activeTab === 'sessions' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Live Rooms & Replays
          </button>
          <button
            onClick={() => setActiveTab('audits')}
            className={`pb-4 text-sm font-semibold border-b-2 transition ${
              activeTab === 'audits' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className={`pb-4 text-sm font-semibold border-b-2 transition ${
              activeTab === 'workflows' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Automations & Sync Logs
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'sessions' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Live Rooms List */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="font-['Outfit'] text-xl font-bold text-slate-200">Active Support Rooms</h3>
                
                {activeSessions.length === 0 ? (
                  <div className="p-8 text-center border border-slate-900 bg-white/[0.002] rounded-2xl text-slate-500 text-sm">
                    No support calls are active at this moment.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeSessions.map((session: any) => (
                      <div key={session.id} className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40 flex justify-between items-center glass-card">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-200 text-base">{session.title}</h4>
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900 border border-slate-800 text-slate-500">{session.ticketRef}</span>
                          </div>
                          <div className="flex gap-4 text-xs text-slate-500 font-medium">
                            <span>Category: <span className="text-slate-300">{session.category?.replace('_', ' ')}</span></span>
                            <span>State: <span className="text-violet-400">{session.status}</span></span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoteTerminate(session.id)}
                          className="px-3.5 py-2 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-600/20 transition"
                        >
                          Terminate Session
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Replay Archives */}
              <div className="space-y-6 lg:border-l lg:border-slate-900 lg:pl-8">
                <h3 className="font-['Outfit'] text-xl font-bold text-slate-200">Recording Archives</h3>
                
                {completedSessions.length === 0 ? (
                  <div className="text-slate-600 text-sm">No archives available.</div>
                ) : (
                  <div className="space-y-4">
                    {completedSessions.map((session: any) => {
                      const recording = session.recordings?.[0];
                      return (
                        <div key={session.id} className="p-4 rounded-xl border border-slate-900 bg-slate-950/10 flex justify-between items-center">
                          <div>
                            <h5 className="font-bold text-slate-300 text-sm mb-1 truncate max-w-[150px]">{session.title}</h5>
                            <span className="text-[10px] text-slate-500 font-medium">
                              Duration: {formatDuration(session.summary?.durationSec || 0)}
                            </span>
                          </div>
                          {recording?.playbackUrl ? (
                            <a
                              href={`${API_URL}${recording.playbackUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-lg hover:bg-violet-600/20 transition flex items-center gap-1.5 text-xs font-bold"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> Play
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-600 italic">No Recording</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Audit Logs tab */}
          {activeTab === 'audits' && (
            <div className="p-6 rounded-3xl border border-slate-900 bg-slate-950/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-['Outfit'] text-xl font-bold text-slate-200 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-slate-500" /> Audit Timeline Trails
                </h3>
              </div>

              {loadingLogs ? (
                <div className="py-8 text-center text-slate-500 text-sm">Loading logs...</div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">No audit logs logged in database.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="text-xs uppercase font-bold text-slate-500 border-b border-slate-900 pb-3">
                      <tr>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">User ID</th>
                        <th className="py-3 px-4">Session ID</th>
                        <th className="py-3 px-4">IP Address</th>
                        <th className="py-3 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/[0.005] transition">
                          <td className="py-3.5 px-4 font-bold text-slate-200">{log.action}</td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{log.userId?.substring(0, 8) || 'System'}</td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{log.sessionId?.substring(0, 8) || 'N/A'}</td>
                          <td className="py-3.5 px-4 text-xs">{log.ipAddress || '127.0.0.1'}</td>
                          <td className="py-3.5 px-4 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Automations & Sync tab */}
          {activeTab === 'workflows' && (
            <div className="space-y-8">
              
              {/* Grid: Workflow builder & list */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Visual Workflow Builder Form */}
                <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
                  <div className="flex items-center gap-2 text-violet-400">
                    <Settings className="w-5 h-5" />
                    <h4 className="font-['Outfit'] font-bold text-slate-100">Workflow Rules Builder</h4>
                  </div>
                  <p className="text-slate-500 text-xs">Configure automation triggers to dispatch Salesforce cases, HubSpot deals, or Slack alerts automatically.</p>

                  <form onSubmit={handleCreateRule} className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">When Event Triggers (Trigger)</label>
                      <select
                        value={newTrigger}
                        onChange={(e) => setNewTrigger(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm"
                      >
                        <option value="SESSION_ENDED">Session Ended</option>
                        <option value="FEEDBACK_RECEIVED">Feedback Received</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Dispatch Action (Action)</label>
                      <select
                        value={newAction}
                        onChange={(e) => setNewAction(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm"
                      >
                        <option value="POST_TO_WEBHOOK">Post Webhook Payload</option>
                        <option value="POST_TO_SLACK">Post to Slack Channel</option>
                        <option value="SYNC_TO_SALESFORCE">Sync Salesforce Case</option>
                        <option value="SYNC_TO_HUBSPOT">Sync HubSpot Deal</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={createWorkflowMutation.isPending}
                      className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 text-xs font-bold transition flex justify-center items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Add Automation Rule
                    </button>
                  </form>
                </div>

                {/* Workflow Rules List */}
                <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-900 bg-slate-950/20 flex flex-col h-[320px] overflow-hidden">
                  <h4 className="font-['Outfit'] font-bold text-slate-200 text-sm mb-4">Active Workflow Rule Nodes</h4>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
                    {!workflows || workflows.length === 0 ? (
                      <div className="text-slate-600 text-xs italic py-8">No rule bindings configured.</div>
                    ) : (
                      workflows.map((rule: any) => (
                        <div key={rule.id} className="p-3.5 rounded-xl border border-slate-900 bg-slate-950/50 flex justify-between items-center gap-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="px-2 py-0.5 bg-slate-900 border border-slate-850 rounded text-slate-400 font-mono font-semibold">{rule.trigger}</span>
                              <span className="text-slate-600 font-bold">➔</span>
                              <span className="px-2 py-0.5 bg-violet-950/30 border border-violet-900/20 rounded text-violet-400 font-mono font-semibold">{rule.action}</span>
                            </div>
                            <span className="text-[9px] text-slate-650 font-mono">{rule.id}</span>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => handleToggleRule(rule.id, rule.enabled)}
                              className="text-slate-400 hover:text-slate-200"
                              title="Toggle rule state"
                            >
                              {rule.enabled ? (
                                <ToggleRight className="w-9 h-9 text-violet-500" />
                              ) : (
                                <ToggleLeft className="w-9 h-9 text-slate-700" />
                              )}
                            </button>
                            
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                              title="Delete Rule"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* CRM Integration sync histories */}
              <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/20">
                <h4 className="font-['Outfit'] font-bold text-slate-200 text-sm mb-4 flex items-center gap-1.5">
                  <Database className="w-4.5 h-4.5 text-slate-500" /> CRM Connector Adapter Sync Logs (Fake/Demo Mode)
                </h4>
                
                {!integrationLogs || integrationLogs.length === 0 ? (
                  <div className="text-slate-600 text-xs italic py-6">No connector sync logs logged.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-400">
                      <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-900 pb-2">
                        <tr>
                          <th className="py-2 px-3">Provider</th>
                          <th className="py-2 px-3">Action</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Result details</th>
                          <th className="py-2 px-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60">
                        {integrationLogs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-white/[0.005] transition">
                            <td className="py-3 px-3 font-mono font-bold text-slate-300">{log.provider}</td>
                            <td className="py-3 px-3">{log.action}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-500 italic truncate max-w-[200px]" title={log.errorMsg || 'Completed successfully'}>
                              {log.errorMsg || 'Mock Sync Success'}
                            </td>
                            <td className="py-3 px-3 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Webhook reliability logging table */}
              <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/20">
                <h4 className="font-['Outfit'] font-bold text-slate-200 text-sm mb-4 flex items-center gap-1.5">
                  <RefreshCw className="w-4.5 h-4.5 text-slate-500" /> Webhook Reliability Dispatch Audits
                </h4>

                {!webhookEvents || webhookEvents.length === 0 ? (
                  <div className="text-slate-600 text-xs italic py-6">No webhook events dispatched yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-400">
                      <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-900 pb-2">
                        <tr>
                          <th className="py-2 px-3">Event Trigger</th>
                          <th className="py-2 px-3">State</th>
                          <th className="py-2 px-3">Attempts</th>
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Payload Data Preview</th>
                          <th className="py-2 px-3">Last Try Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60">
                        {webhookEvents.map((evt: any) => (
                          <tr key={evt.id} className="hover:bg-white/[0.005] transition">
                            <td className="py-3 px-3 font-bold text-slate-350">{evt.event}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                evt.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                evt.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}>
                                {evt.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">{evt.attempts}</td>
                            <td className="py-3 px-3 font-mono">{evt.responseCode || 'N/A'}</td>
                            <td className="py-3 px-3 font-mono text-[10px] text-slate-550 max-w-[250px] truncate" title={evt.payload}>
                              {evt.payload}
                            </td>
                            <td className="py-3 px-3 text-slate-600">{evt.lastAttempt ? new Date(evt.lastAttempt).toLocaleString() : 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ActivitySpinner() {
  return (
    <div className="w-5 h-5 border-2 border-violet-500/25 border-t-violet-500 rounded-full animate-spin" />
  );
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${mins}m ${remainder}s`;
}
