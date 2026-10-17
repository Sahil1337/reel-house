/** Accounts and profiles — mirror the planned users / profile tables. */
import type { MaturityLevel } from "./catalog";

/** users.role — admins get the /admin panel and the /api/admin/** routes. */
export type UserRole = "USER" | "ADMIN";

/** Never includes the password hash; that stays inside the backend. */
export interface User {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

export type AvatarKey = "lamp" | "reel" | "ticket" | "clapper" | "star" | "mask" | "popcorn" | "camera";

export interface Profile {
  profileId: number;
  userId: number;
  name: string;
  avatar: AvatarKey;
  maturityLevel: MaturityLevel;
  onboardingCompleted: boolean;
}

export interface ProfileInput {
  name: string;
  avatar: AvatarKey;
  maturityLevel: MaturityLevel;
}

/** What the sign-up form sends (POST /api/auth/sign-up); the password is hashed before it reaches a service. */
export interface SignUpInput {
  name: string;
  email: string;
  phone: string | null;
  password: string;
}

/** The users row to insert: sign-up input with the password already hashed ("scrypt$<salt>$<hash>"). */
export interface NewUser {
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
}
