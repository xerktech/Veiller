// react-sdk/src/UseVeillerAuth.ts
import { useContext } from 'react';
import { VeillerAuthContext, VeillerAuthContextType } from './AuthProvider';

/**
 * Custom hook to access the Veiller authentication context.
 *
 * @returns {VeillerAuthContextType} The authentication context containing user state,
 * loading status, error information, and authentication methods.
 *
 * @throws {Error} When used outside of an VeillerAuthProvider component.
 *
 * @example
 * ```tsx
 * const { userId, isAuthenticated, logout, isLoading } = UseVeillerAuth();
 * ```
 */
export const useVeillerAuth = (): VeillerAuthContextType => {
  const context = useContext(VeillerAuthContext);
  if (context === undefined) {
    throw new Error('UseVeillerAuth must be used within an VeillerAuthProvider');
  }
  return context;
};