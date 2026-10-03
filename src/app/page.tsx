'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Shield,
  User,
  Users,
  MessageSquare,
  History,
  Send,
  Zap,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  version: number;
  assignedTeamId: string | null;
  assignedTeam?: { id: string; name: string } | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string; email: string } | null;
  createdById: string;
  createdBy: { id: string; name: string; email: string };
  tags: string[];
  createdAt: string;
  updatedAt: string;
  activityLogs?: any[];
  comments?: any[];
}

interface UserContext {
  id: string;
  name: string;
  email: string;
  role: string;
  memberships: { teamId: string; teamName: string; role: string }[];
}

export default function DashboardPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selection & Detail Drawer
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Comment input
  const [commentText, setCommentText] = useState('');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('ENGINEERING_PROBLEM');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [newTeamId, setNewTeamId] = useState('');

  // Background Job status
  const [jobNotice, setJobNotice] = useState<string | null>(null);

  // Load user directory & teams on mount
  useEffect(() => {
    fetchTeamsAndUsers();
  }, []);

  // Fetch work items when filters or user changes
  useEffect(() => {
    fetchWorkItems();
  }, [searchTerm, statusFilter, priorityFilter, teamFilter, page, currentUser?.id]);

  // Fetch detail when selected item changes
  useEffect(() => {
    if (selectedItemId) {
      fetchItemDetail(selectedItemId);
    } else {
      setSelectedItem(null);
    }
  }, [selectedItemId]);

  const fetchTeamsAndUsers = async () => {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      setTeams(data.teams || []);
      setUsers(data.users || []);

      if (data.users && data.users.length > 0 && !currentUser) {
        // Set default current user context
        const defaultUser = data.users.find((u: any) => u.email === 'lead.eng@newtonite.com') || data.users[0];
        fetchUserContext(defaultUser.id);
      }
    } catch (err) {
      console.error('Failed to load teams/users', err);
    }
  };

  const fetchUserContext = async (userId: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'x-user-id': userId },
      });
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Failed to load user context', err);
    }
  };

  const fetchWorkItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);
      if (teamFilter !== 'ALL') params.append('teamId', teamFilter);
      if (searchTerm) params.append('search', searchTerm);
      params.append('page', page.toString());
      params.append('limit', '10');

      const headers: any = {};
      if (currentUser) headers['x-user-id'] = currentUser.id;

      const res = await fetch(`/api/work-items?${params.toString()}`, { headers });
      const data = await res.json();
      setItems(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch items', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchItemDetail = async (id: string) => {
    setConflictError(null);
    setActionError(null);
    try {
      const headers: any = {};
      if (currentUser) headers['x-user-id'] = currentUser.id;

      const res = await fetch(`/api/work-items/${id}`, { headers });
      const data = await res.json();
      if (data.data) {
        setSelectedItem(data.data);
      }
    } catch (err) {
      console.error('Failed to load detail', err);
    }
  };

  const handleCreateWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const idempotencyKey = `create-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      const res = await fetch('/api/work-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          type: newType,
          priority: newPriority,
          assignedTeamId: newTeamId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data.message || 'Failed to create work item');
        return;
      }

      setIsCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      fetchWorkItems();
    } catch (err: any) {
      setActionError(err.message || 'Network error');
    }
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!selectedItem || !currentUser) return;
    setConflictError(null);
    setActionError(null);

    const idempotencyKey = `trans-${selectedItem.id}-${newStatus}-${Date.now()}`;

    try {
      const res = await fetch(`/api/work-items/${selectedItem.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          expectedVersion: selectedItem.version,
          newStatus,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setConflictError(`CONCURRENCY CONFLICT (409): Item version changed (Expected v${selectedItem.version}).`);
        return;
      }

      if (!res.ok) {
        setActionError(data.message || 'Transition failed');
        return;
      }

      fetchItemDetail(selectedItem.id);
      fetchWorkItems();
    } catch (err: any) {
      setActionError(err.message || 'Network error');
    }
  };

  const handleAssignItem = async (newAssigneeId: string | null) => {
    if (!selectedItem || !currentUser) return;
    setConflictError(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/work-items/${selectedItem.id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          expectedVersion: selectedItem.version,
          newAssigneeId,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setConflictError(`CONCURRENCY CONFLICT (409): Item version changed (Expected v${selectedItem.version}).`);
        return;
      }

      if (!res.ok) {
        setActionError(data.message || 'Assignment failed');
        return;
      }

      fetchItemDetail(selectedItem.id);
      fetchWorkItems();
    } catch (err: any) {
      setActionError(err.message || 'Network error');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !currentUser || !commentText.trim()) return;

    try {
      const res = await fetch(`/api/work-items/${selectedItem.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ content: commentText }),
      });

      if (res.ok) {
        setCommentText('');
        fetchItemDetail(selectedItem.id);
      }
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  const triggerAsyncJobQueue = async () => {
    setJobNotice('Triggering background job processing...');
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      if (data.result?.processed) {
        setJobNotice(`Async Job Processed: ID ${data.result.jobId?.substring(0, 8)} (${data.result.status})`);
      } else {
        setJobNotice('No pending jobs in queue.');
      }

      setTimeout(() => setJobNotice(null), 4000);
    } catch (err) {
      setJobNotice('Failed to process job queue');
    }
  };

  // Helper badge styles
  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return 'bg-red-500/20 text-red-400 border-red-500/30 badge-urgent';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'MEDIUM':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'OPEN':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      case 'IN_PROGRESS':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'PENDING_APPROVAL':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
      case 'RESOLVED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'CLOSED':
        return 'bg-slate-700 text-slate-400 border-slate-600';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="glass-header sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
            N
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              NEWTONITE
            </h1>
            <p className="text-xs text-cyan-400 font-medium tracking-wide">OPERATIONS UNDER PRESSURE</p>
          </div>
        </div>

        {/* User Context & Queue Controller */}
        <div className="flex items-center gap-4">
          <button
            onClick={triggerAsyncJobQueue}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
            title="Trigger async worker cycle"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Process Async Queue</span>
          </button>

          {/* User selector dropdown */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
            <User className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400 font-medium">Acting User:</span>
            <select
              className="bg-transparent text-xs text-slate-100 font-semibold focus:outline-none cursor-pointer"
              value={currentUser?.id || ''}
              onChange={(e) => fetchUserContext(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100">
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-cyan-500/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Work Item</span>
          </button>
        </div>
      </header>

      {/* Async Notice Banner */}
      {jobNotice && (
        <div className="bg-cyan-950/80 border-b border-cyan-800/50 px-6 py-2 text-xs text-cyan-200 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>{jobNotice}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex gap-6">
        {/* Work Item List View */}
        <div className={`flex-1 flex flex-col gap-5 ${selectedItem ? 'w-2/3' : 'w-full'} transition-all`}>
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Work Items</p>
                <p className="text-2xl font-extrabold text-white mt-1">{items.length}</p>
              </div>
              <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Urgent / High</p>
                <p className="text-2xl font-extrabold text-red-400 mt-1">
                  {items.filter((i) => i.priority === 'URGENT' || i.priority === 'HIGH').length}
                </p>
              </div>
              <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Pending Approval</p>
                <p className="text-2xl font-extrabold text-amber-300 mt-1">
                  {items.filter((i) => i.status === 'PENDING_APPROVAL').length}
                </p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl text-amber-300">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Resolved / Closed</p>
                <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                  {items.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length}
                </p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search work items by title, description or tag..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Team Filter */}
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="ALL">All Teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchWorkItems}
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition"
                title="Refresh list"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Items List Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Title & Type</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Priority</th>
                    <th className="px-4 py-3.5">Version</th>
                    <th className="px-4 py-3.5">Assigned Team & Assignee</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        Loading operational work items...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No work items match selected criteria.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={`hover:bg-slate-800/40 cursor-pointer transition ${
                          selectedItemId === item.id ? 'bg-cyan-950/30 border-l-4 border-cyan-500' : ''
                        }`}
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-100 text-sm">{item.title}</p>
                          <span className="inline-block mt-1 text-[10px] text-cyan-400 font-medium tracking-wide uppercase">
                            {item.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusBadge(
                              item.status
                            )}`}
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getPriorityBadge(
                              item.priority
                            )}`}
                          >
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-slate-400">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]">
                            v{item.version}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-slate-200 font-medium">
                            {item.assignedTeam?.name || 'Unassigned Team'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {item.assignedTo?.name || 'Unassigned Member'}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg font-medium text-xs transition"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Work Item Detail Drawer / Modal Side Panel */}
        {selectedItem && (
          <div className="w-1/3 glass-card rounded-2xl p-5 flex flex-col gap-4 border border-slate-800 shadow-2xl overflow-y-auto max-h-[calc(100vh-120px)] animate-slide-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-cyan-400">#{selectedItem.id.substring(0, 8)}</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-amber-400">
                  Version v{selectedItem.version}
                </span>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Title & Metadata */}
            <div>
              <h2 className="text-lg font-bold text-slate-100">{selectedItem.title}</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{selectedItem.description}</p>
            </div>

            {/* Concurrency Conflict Banner */}
            {conflictError && (
              <div className="bg-red-950/90 border border-red-800 rounded-xl p-3.5 text-xs text-red-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Stale Data Conflict (HTTP 409)</span>
                </div>
                <p className="text-[11px] text-red-300">{conflictError}</p>
                <button
                  onClick={() => fetchItemDetail(selectedItem.id)}
                  className="self-start px-3 py-1 bg-red-900 hover:bg-red-800 text-white rounded-lg font-medium text-[11px] flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Latest Version from Server</span>
                </button>
              </div>
            )}

            {/* Action Error Banner */}
            {actionError && (
              <div className="bg-amber-950/80 border border-amber-800 rounded-xl p-3 text-xs text-amber-200">
                {actionError}
              </div>
            )}

            {/* Interactive Workflow Transition Controls */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Workflow State Actions
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedItem.status === 'OPEN' && (
                  <button
                    onClick={() => handleStatusTransition('IN_PROGRESS')}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-lg transition"
                  >
                    Start Work
                  </button>
                )}
                {selectedItem.status === 'IN_PROGRESS' && (
                  <>
                    <button
                      onClick={() => handleStatusTransition('PENDING_APPROVAL')}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Submit for Approval
                    </button>
                    <button
                      onClick={() => handleStatusTransition('RESOLVED')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition"
                    >
                      Resolve Directly
                    </button>
                  </>
                )}
                {selectedItem.status === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      onClick={() => handleStatusTransition('RESOLVED')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg flex items-center gap-1 transition"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Approve & Resolve (Lead Only)</span>
                    </button>
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs rounded-lg transition"
                    >
                      Reject to In Progress
                    </button>
                  </>
                )}
                {(selectedItem.status === 'RESOLVED' || selectedItem.status === 'IN_PROGRESS') && (
                  <button
                    onClick={() => handleStatusTransition('CLOSED')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 rounded-lg transition"
                  >
                    Close Work Item
                  </button>
                )}
              </div>
            </div>

            {/* Reassignment Control */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Assignee & Ownership
              </span>
              <select
                value={selectedItem.assignedToId || ''}
                onChange={(e) => handleAssignItem(e.target.value || null)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Activity Log Audit Timeline */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <History className="w-4 h-4 text-cyan-400" />
                <span>Immutable Audit History</span>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {selectedItem.activityLogs?.map((log: any) => (
                  <div key={log.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-semibold text-cyan-400">{log.actor?.name || 'System'}</span>
                      <span className="text-[10px] font-mono">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="font-bold text-slate-200 mt-1 uppercase text-[11px]">{log.action}</p>
                    {log.details && (
                      <pre className="mt-1 p-2 bg-slate-950 rounded text-[10px] font-mono text-slate-400 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Discussion Thread */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span>Comments ({selectedItem.comments?.length || 0})</span>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {selectedItem.comments?.map((c: any) => (
                  <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 text-xs">
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span className="font-semibold text-purple-300">{c.author?.name}</span>
                      <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-200 mt-1">{c.content}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add operational note..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  type="submit"
                  className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Create Work Item Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl p-6 border border-slate-800 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100">Create Operational Work Item</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkItem} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Database connection pool exhaustion"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Category / Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                  >
                    <option value="CUSTOMER_ISSUE">Customer Issue</option>
                    <option value="ENGINEERING_PROBLEM">Engineering Problem</option>
                    <option value="PAYMENT_INVESTIGATION">Payment Investigation</option>
                    <option value="PRODUCTION_INCIDENT">Production Incident</option>
                    <option value="COMPLIANCE_REQUEST">Compliance Request</option>
                    <option value="OPERATIONAL_APPROVAL">Operational Approval</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                  >
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Assigned Team</label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="">Select Team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detailed description of the situation..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-cyan-500/20"
                >
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
