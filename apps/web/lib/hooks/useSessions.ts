import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/useAuthStore';
import { ApiResponse } from '@supportstream/shared-types';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_BASE_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

// Helper to handle standard API responses and formats errors
async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  token?: string | null,
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.error?.message || 'Request failed');
  }

  return result.data;
}

// 1. Hook to fetch past calls history
export function useSessionHistory() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['sessions', 'history'],
    queryFn: () => apiRequest<any[]>('/sessions/history', 'GET', undefined, token),
    enabled: !!token,
  });
}

// 1.5. Hook to fetch single session details
export function useSessionDetails(sessionId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => apiRequest<any>(`/sessions/${sessionId}`, 'GET', undefined, token),
    enabled: !!token && !!sessionId,
  });
}

// 2. Hook to fetch messages for a session room
export function useChatHistory(sessionId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => apiRequest<any[]>(`/chat/${sessionId}`, 'GET', undefined, token),
    enabled: !!token && !!sessionId,
    refetchInterval: 5000,
  });
}

// 3. Mutation to create a new session
export function useCreateSession() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (dto: {
      title: string;
      description?: string;
      category?: string;
      severity?: string;
      department?: string;
      assignedAgentId?: string;
      assignedTeam?: string;
    }) =>
      apiRequest<{ session: any; inviteToken: string }>('/sessions', 'POST', dto, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'history'] });
    },
  });
}

// 4. Mutation to regenerate invite
export function useRegenerateInvite() {
  const token = useAuthStore((state) => state.token);
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<{ inviteToken: string }>(`/sessions/${sessionId}/invite/regenerate`, 'POST', {}, token),
  });
}

// 5. Mutation to join via invite
export function useJoinInvite() {
  return useMutation({
    mutationFn: (variables: {
      token: string;
      displayName: string;
      email: string;
      company?: string;
      phone?: string;
      notes?: string;
    }) =>
      apiRequest<{ accessToken: string; session: any }>('/sessions/join', 'POST', {
        token: variables.token,
        clientData: {
          displayName: variables.displayName,
          email: variables.email,
          company: variables.company,
          phone: variables.phone,
          notes: variables.notes,
        },
      }),
  });
}

// 6. Mutation to end session
export function useEndSession() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { sessionId: string; resolutionStatus: string; agentNotes?: string }) =>
      apiRequest<{ session: any; summary: any }>(
        `/sessions/${variables.sessionId}/end`,
        'POST',
        { resolutionStatus: variables.resolutionStatus, agentNotes: variables.agentNotes },
        token,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['chat', variables.sessionId] });
    },
  });
}

// 7. Mutation to submit feedback
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (variables: { sessionId: string; rating: number; resolved: boolean; comments?: string }) =>
      apiRequest<any>(`/sessions/${variables.sessionId}/feedback`, 'POST', {
        rating: variables.rating,
        resolved: variables.resolved,
        comments: variables.comments,
      }),
  });
}

// 8. Workflows Queries & Mutations
export function useWorkflowRules() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['workflows', 'rules'],
    queryFn: () => apiRequest<any[]>('/sessions/workflows/rules', 'GET', undefined, token),
    enabled: !!token,
  });
}

export function useCreateWorkflowRule() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { trigger: string; action: string }) =>
      apiRequest<any>('/sessions/workflows/rules', 'POST', variables, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', 'rules'] });
    },
  });
}

export function useToggleWorkflowRule() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; enabled: boolean }) =>
      apiRequest<any>(`/sessions/workflows/rules/${variables.id}/toggle`, 'POST', { enabled: variables.enabled }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', 'rules'] });
    },
  });
}

export function useDeleteWorkflowRule() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<any>(`/sessions/workflows/rules/${id}`, 'DELETE', undefined, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', 'rules'] });
    },
  });
}

export function useIntegrationLogs() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['logs', 'integrations'],
    queryFn: () => apiRequest<any[]>('/sessions/logs/integrations', 'GET', undefined, token),
    enabled: !!token,
    refetchInterval: 10000,
  });
}

export function useWebhookEvents() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['logs', 'webhooks'],
    queryFn: () => apiRequest<any[]>('/sessions/logs/webhooks', 'GET', undefined, token),
    enabled: !!token,
    refetchInterval: 10000,
  });
}

export function useUpdateSession() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      sessionId: string;
      title?: string;
      description?: string;
      category?: string;
      severity?: string;
      department?: string;
      status?: string;
      resolutionStatus?: string;
      agentNotes?: string;
    }) => {
      const { sessionId, ...data } = variables;
      return apiRequest<any>(`/sessions/${sessionId}/update`, 'POST', data, token);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', variables.sessionId] });
    },
  });
}

export function useDeleteSession() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<any>(`/sessions/${sessionId}`, 'DELETE', undefined, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'history'] });
    },
  });
}

export function useAiCopilot() {
  const token = useAuthStore((state) => state.token);
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<{ summary: string; suggestedNotes: string; followUpEmail: string }>(
        `/sessions/${sessionId}/ai-copilot`,
        'POST',
        {},
        token,
      ),
  });
}


