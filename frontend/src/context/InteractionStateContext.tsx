import React, { createContext, useContext, useState, ReactNode } from 'react';
import api from '../utils/api';

// Types
interface EntityRequest {
  type: 'discussion' | 'topic' | 'idea';
  id: string;
}

interface UserState {
  liked: boolean;
  pinned: boolean;
  saved: boolean;
  view_count: number;
  first_viewed_at?: string;
  last_viewed_at?: string;
  user_rating?: number;
}

interface Metrics {
  like_count: number;
  view_count: number;
  pin_count: number;
  save_count: number;
  unique_view_count: number;
  rating_count: number;
  rating_sum: number;
  average_rating: number;
  rating_distribution: Record<string, number>;
  last_activity_at?: string;
}

interface InteractionState {
  metrics?: Metrics;
  user_state?: UserState;
  can_like: boolean;
  can_pin: boolean;
  can_save: boolean;
}

interface BulkStateResponse {
  states: Record<string, InteractionState>;
}

// Context
interface InteractionStateContextType {
  states: Record<string, InteractionState>;
  isLoading: boolean;
  error: string | null;
  loadBulkStates: (entities: EntityRequest[]) => Promise<void>;
  updateState: (entityKey: string, newState: Partial<InteractionState>) => void;
  getState: (entityType: string, entityId: string) => InteractionState | null;
  refreshState: (entityType: string, entityId: string) => Promise<void>;
}

const InteractionStateContext = createContext<InteractionStateContextType | undefined>(undefined);

// Provider Props
interface InteractionStateProviderProps {
  children: ReactNode;
  participationToken?: string | null;
}

// Provider Component
export const InteractionStateProvider: React.FC<InteractionStateProviderProps> = ({
  children,
  participationToken = null
}) => {
  const [states, setStates] = useState<Record<string, InteractionState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBulkStates = async (entities: EntityRequest[]) => {
    if (!entities.length) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (participationToken) {
        headers['X-Participation-Token'] = participationToken;
      }

      const response = await api.post<BulkStateResponse>(
        '/interaction/bulk-state',
        { entities },
        { headers }
      );

      setStates(prevStates => ({
        ...prevStates,
        ...response.data.states
      }));

    } catch (err: unknown) {
      console.error('Error loading bulk interaction states:', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err as any).response?.data?.detail || 'Failed to load interaction states'
        : 'Failed to load interaction states';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const updateState = (entityKey: string, newState: Partial<InteractionState> | ((prevState: InteractionState) => Partial<InteractionState>)) => {
    setStates(prevStates => {
      const currentEntityState = prevStates[entityKey] || { can_like: false, can_pin: false, can_save: false };
      const stateUpdate = typeof newState === 'function' ? newState(currentEntityState as InteractionState) : newState;

      return {
        ...prevStates,
        [entityKey]: {
          ...currentEntityState,
          ...stateUpdate
        } as InteractionState
      };
    });
  };

  const getState = (entityType: string, entityId: string): InteractionState | null => {
    const entityKey = `${entityType}:${entityId}`;
    return states[entityKey] || null;
  };

  const refreshState = async (entityType: string, entityId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (participationToken) {
        headers['X-Participation-Token'] = participationToken;
      }

      const response = await api.get<InteractionState>(
        `/interaction/${entityType}/${entityId}/state`,
        { headers }
      );

      const entityKey = `${entityType}:${entityId}`;
      updateState(entityKey, response.data);

    } catch (err: unknown) {
      console.error(`Error refreshing state for ${entityType}:${entityId}:`, err);
    }
  };

  const contextValue: InteractionStateContextType = {
    states,
    isLoading,
    error,
    loadBulkStates,
    updateState,
    getState,
    refreshState
  };

  return (
    <InteractionStateContext.Provider value={contextValue}>
      {children}
    </InteractionStateContext.Provider>
  );
};

// Hook
export const useInteractionState = (): InteractionStateContextType => {
  const context = useContext(InteractionStateContext);
  if (context === undefined) {
    throw new Error('useInteractionState must be used within an InteractionStateProvider');
  }
  return context;
};

// Helper hook for individual entity state
export const useEntityState = (entityType: string, entityId: string) => {
  const { getState, updateState, refreshState } = useInteractionState();
  
  const state = getState(entityType, entityId);
  const entityKey = `${entityType}:${entityId}`;
  
  const updateEntityState = (newState: Partial<InteractionState>) => {
    updateState(entityKey, newState);
  };
  
  const refreshEntityState = () => {
    return refreshState(entityType, entityId);
  };
  
  return {
    state,
    updateState: updateEntityState,
    refreshState: refreshEntityState
  };
};
