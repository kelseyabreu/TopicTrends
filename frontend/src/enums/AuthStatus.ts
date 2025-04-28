/**
 * Defines the possible states of the authentication process.
 */
export enum AuthStatus {
    /** Initial state before the first authentication check. */
    Idle = 'idle',

    /** An authentication check or process (login/logout) is currently in progress. */
    Loading = 'loading',

    /** The user has been successfully authenticated (valid cookie/session found). */
    Authenticated = 'authenticated',

    /** The user is not authenticated (no valid cookie/session, or logout completed). */
    Unauthenticated = 'unauthenticated',
}