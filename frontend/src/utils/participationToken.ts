/**
 * Utility functions for managing participation tokens
 */

/**
 * Generates the session storage key for a participation token
 * @param discussionId - The discussion ID
 * @returns The session storage key
 */
export const getParticipationTokenKey = (discussionId: string | undefined): string =>
  `TopicTrends_participation_token_${discussionId || "unknown"}`;

/**
 * Gets the participation token from session storage
 * @param discussionId - The discussion ID
 * @returns The participation token or null if not found
 */
export const getParticipationToken = (discussionId: string | undefined): string | null => {
  if (!discussionId) return null;
  const key = getParticipationTokenKey(discussionId);
  return sessionStorage.getItem(key);
};

/**
 * Sets the participation token in session storage
 * @param discussionId - The discussion ID
 * @param token - The participation token
 */
export const setParticipationToken = (discussionId: string | undefined, token: string): void => {
  if (!discussionId) return;
  const key = getParticipationTokenKey(discussionId);
  sessionStorage.setItem(key, token);
};

/**
 * Removes the participation token from session storage
 * @param discussionId - The discussion ID
 */
export const removeParticipationToken = (discussionId: string | undefined): void => {
  if (!discussionId) return;
  const key = getParticipationTokenKey(discussionId);
  sessionStorage.removeItem(key);
};
