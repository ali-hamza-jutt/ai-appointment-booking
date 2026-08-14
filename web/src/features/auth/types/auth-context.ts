import type {
  AuthResponse,
  AuthUserResponse,
} from "@/generated/api/models";
import type { AccessTokenPersistence } from "@/lib/auth/token-storage";

export type AuthenticationStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthContextValue {
  completeAuthentication: (
    response: AuthResponse,
    persistence: AccessTokenPersistence,
  ) => void;
  error: Error | null;
  retryAuthentication: () => void;
  signOut: () => void;
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
