import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Heart, Pin, Bookmark, Loader2 } from 'lucide-react'; 
import api from '../utils/api'; 

// --- TypeScript Interfaces for API Responses ---
export interface InteractionUserState {
    liked?: boolean;
    pinned?: boolean;
    saved?: boolean;
}

export interface InteractionStateApiResponse {
    user_state?: InteractionUserState;
    can_like?: boolean;
    can_pin?: boolean;
    can_save?: boolean;
}

// --- API Client  ---
const interactionAPI = {
    recordInteraction: async (
        entityType: string,
        entityId: string,
        action: 'like' | 'unlike' | 'pin' | 'unpin' | 'save' | 'unsave' 
    ): Promise<any> => {
        try {
            const response = await api.post(`/interaction/${entityType}/${entityId}/${action}`);
            return await response.data;
        } catch (error) {
            console.error(`Interaction interaction (${action}) failed:`, error);
            throw error;
        }
    },

    getInteractionState: async (
        entityType: string,
        entityId: string
    ): Promise<InteractionStateApiResponse> => {
        try {
            const response = await api.get(`/interaction/${entityType}/${entityId}/state`);
            return await response.data;
        } catch (error) {
            console.error('Failed to get interaction state:', error);
            throw error;
        }
    }
};

// --- Component Props ---
export type InteractionActionType = 'like' | 'pin' | 'save'; 

export interface InteractionButtonProps {
    entityType: 'discussion' | 'topic' | 'idea';
    entityId: string;
    actionType: InteractionActionType; // 'like', 'pin', or 'save'

    activeIcon?: React.ReactNode;   // Icon when state is active (e.g., liked, pinned, saved)
    inactiveIcon?: React.ReactNode; // Icon when state is inactive

    activeLabel?: string;   // Label for the active state (e.g., "Unlike", "Unpin")
    inactiveLabel?: string; // Label for the inactive state (e.g., "Like", "Pin")

    className?: string;
    iconSize?: number;
    showLabel?: boolean;
    initialActive?: boolean; // Initial state (e.g., isLiked, isPinned)

    onStateChange?: (isActive: boolean, actionType: InteractionActionType) => void;
    disableInitialFetch?: boolean;
}

const InteractionButton: React.FC<InteractionButtonProps> = ({
    entityType,
    entityId,
    actionType,
    activeIcon,
    inactiveIcon,
    activeLabel,
    inactiveLabel, 
    className = '',
    iconSize = 20,
    showLabel = true,
    initialActive = false,
    onStateChange,
    disableInitialFetch = false,
}) => {
    const [isActive, setIsActive] = useState<boolean>(initialActive);
    const [canInteract, setCanInteract] = useState<boolean>(false); 
    const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(!disableInitialFetch);
    const [isInteracting, setIsInteracting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const requestInFlightRef = useRef(false);
    const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onStateChangeRef = useRef(onStateChange);
    useEffect(() => {
        onStateChangeRef.current = onStateChange;
    }, [onStateChange]);

    useEffect(() => {
        if (disableInitialFetch || !entityId || !entityType) {
            setIsActive(initialActive);
            setCanInteract(true); // Assume can interact if initial fetch is disabled
            setIsLoadingInitial(false);
            return;
        }

        let isMounted = true;
        setIsLoadingInitial(true);
        setError(null);

        interactionAPI.getInteractionState(entityType, entityId)
            .then(state => {
                if (isMounted) {
                    let serverActive = initialActive;
                    let serverCanInteract = false;

                    if (actionType === 'like') {
                        serverActive = state?.user_state?.liked ?? initialActive;
                        serverCanInteract = state?.can_like ?? false;
                    } else if (actionType === 'pin') {
                        serverActive = state?.user_state?.pinned ?? initialActive;
                        serverCanInteract = state?.can_pin ?? false;
                    } else if (actionType === 'save') {
                        serverActive = state?.user_state?.saved ?? initialActive;
                        serverCanInteract = state?.can_save ?? false;
                    }

                    setIsActive(serverActive);
                    setCanInteract(serverCanInteract);
                    onStateChangeRef.current?.(serverActive, actionType);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    setError(err.message || `Failed to load ${actionType} state.`);
                    setIsActive(initialActive); // Revert to initial prop on error
                }
                console.error(`Error fetching ${actionType} state:`, err);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoadingInitial(false);
                }
            });

        return () => {
            isMounted = false;
            if (errorTimeoutRef.current) {
                clearTimeout(errorTimeoutRef.current);
            }
        };
    }, [entityType, entityId, disableInitialFetch, initialActive, actionType]);


    const handleToggleState = useCallback(async () => {
        if (requestInFlightRef.current || isInteracting || isLoadingInitial) return;

        if (!canInteract && !isActive) { 
            setError(`Login to ${inactiveLabel || actionType} this item.`);
            if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
            return;
        }

        requestInFlightRef.current = true;
        setIsInteracting(true);
        setError(null);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);

        const newActiveState = !isActive;
        let apiAction: 'like' | 'unlike' | 'pin' | 'unpin' | 'save' | 'unsave';

        switch (actionType) {
            case 'like': apiAction = newActiveState ? 'like' : 'unlike'; break;
            case 'pin': apiAction = newActiveState ? 'pin' : 'unpin'; break;
            case 'save': apiAction = newActiveState ? 'save' : 'unsave'; break;
            default:
                console.error("Invalid actionType for InteractionButton");
                requestInFlightRef.current = false;
                setIsInteracting(false);
                return;
        }

        const prevActiveState = isActive;

        setIsActive(newActiveState);
        onStateChangeRef.current?.(newActiveState, actionType);

        try {
            await interactionAPI.recordInteraction(entityType, entityId, apiAction);
        } catch (err) {
            setIsActive(prevActiveState);
            onStateChangeRef.current?.(prevActiveState, actionType);
            const errorMessage = err?.detail || err?.message || `Failed to ${apiAction}.`;
            setError(errorMessage);
            console.error(`Error ${apiAction}ing entity:`, err);
            if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
        } finally {
            requestInFlightRef.current = false;
            setIsInteracting(false);
        }
    }, [isInteracting, isLoadingInitial, canInteract, isActive, actionType, entityType, entityId, inactiveLabel]);

    // --- Default Icons & Labels based on actionType ---
    const getDefaults = () => {
        switch (actionType) {
            case 'pin':
                return {
                    defaultActiveIcon: <Pin className="text-sky-500 group-hover:text-sky-600" size={iconSize} fill="currentColor" />,
                    defaultInactiveIcon: <Pin className="text-gray-500 group-hover:text-sky-500" size={iconSize} fill="none" stroke="currentColor" strokeWidth={2} />,
                    defaultActiveLabel: "Unpin",
                    defaultInactiveLabel: "Pin",
                };
            case 'save':
                return {
                    defaultActiveIcon: <Bookmark className="text-green-500 group-hover:text-green-600" size={iconSize} fill="currentColor" />,
                    defaultInactiveIcon: <Bookmark className="text-gray-500 group-hover:text-green-500" size={iconSize} fill="none" stroke="currentColor" strokeWidth={2} />,
                    defaultActiveLabel: "Unsave",
                    defaultInactiveLabel: "Save",
                };
            case 'like':
            default:
                return {
                    defaultActiveIcon: <Heart className="text-rose-500 group-hover:text-rose-600" size={iconSize} fill="currentColor" />,
                    defaultInactiveIcon: <Heart className="text-gray-500 group-hover:text-rose-500" size={iconSize} fill="none" stroke="currentColor" strokeWidth={2} />,
                    defaultActiveLabel: "Unlike",
                    defaultInactiveLabel: "Like",
                };
        }
    };

    const { defaultActiveIcon, defaultInactiveIcon, defaultActiveLabel, defaultInactiveLabel } = getDefaults();

    const currentActiveIcon = activeIcon || defaultActiveIcon;
    const currentInactiveIcon = inactiveIcon || defaultInactiveIcon;
    const currentLabel = (isActive ? (activeLabel || defaultActiveLabel) : (inactiveLabel || defaultInactiveLabel));


    const renderIcon = () => {
        if (isLoadingInitial || isInteracting) {
            return <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />;
        }
        return isActive ? currentActiveIcon : currentInactiveIcon;
    };

    const isDisabled = isLoadingInitial || isInteracting || (!canInteract && !isActive);
    // Use currentLabel for aria-label and title
    const buttonTitle = error || currentLabel || (canInteract ? (inactiveLabel || defaultInactiveLabel) : `Login to ${inactiveLabel || defaultInactiveLabel}`);
    const ariaLabelText = currentLabel || (isActive ? defaultActiveLabel : defaultInactiveLabel);


    const baseClasses = "group flex items-center gap-1.5 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 rounded-md";
    const disabledClasses = isDisabled && !(isLoadingInitial || isInteracting) ? "opacity-60 cursor-not-allowed" : "cursor-pointer";
    const errorHintClasses = error ? "ring-1 ring-red-400" : "";

    return (
        <>
            <button
                type="button"
                className={`${baseClasses} ${disabledClasses} ${errorHintClasses} ${className} p-1.5`} // Adjusted padding
                onClick={handleToggleState}
                disabled={isDisabled}
                aria-label={ariaLabelText}
                aria-pressed={isActive}
                title={buttonTitle}
            >
                <span
                    style={{ width: iconSize, height: iconSize }}
                    className="flex items-center justify-center"
                >
                    {renderIcon()}
                </span>
                {currentLabel && showLabel && <span className="text-sm sr-only sm:not-sr-only">{currentLabel}</span>}
            </button>
            {error && (
                <div role="alert" aria-live="assertive" className="sr-only">
                    {error}
                </div>
            )}
        </>
    );
};

export default InteractionButton;