import type {
  AuthResponse,
  AuthUserResponse,
} from "@/generated/api/models";

export type AuthenticationStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthContextValue {
  completeAuthentication: (response: AuthResponse) => void;
  error: Error | null;
  retryAuthentication: () => void;
  signOut: () => Promise<void>;
  /** Replaces the cached user after a profile change (email or phone verified). */
  updateUser: (user: AuthUserResponse) => void;
  status: AuthenticationStatus;
  user: AuthUserResponse | null;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}

export interface SignupFormErrors {
  email?: string;
  fullName?: string;
  password?: string;
  passwordConfirmation?: string;
  terms?: string;
}
